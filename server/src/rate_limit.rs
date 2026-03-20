use actix_web::dev::{ServiceRequest, ServiceResponse, Transform, Service};
use actix_web::{Error, HttpResponse, body::EitherBody};
use std::collections::HashMap;
use std::future::{self, Ready, Future};
use std::pin::Pin;
use std::sync::Mutex;
use std::time::Instant;
use std::net::IpAddr;

/// Shared state across all workers. Create once, clone into each worker.
pub type RateLimiterState = std::sync::Arc<Mutex<HashMap<IpAddr, Vec<Instant>>>>;

pub fn new_state() -> RateLimiterState {
    std::sync::Arc::new(Mutex::new(HashMap::new()))
}

/// Simple per-IP rate limiter.
/// `max_requests` allowed per `window_secs` second window.
#[derive(Clone)]
pub struct RateLimiter {
    state: RateLimiterState,
    max_requests: usize,
    window_secs: u64,
}

impl RateLimiter {
    pub fn new(state: RateLimiterState, max_requests: usize, window_secs: u64) -> Self {
        Self { state, max_requests, window_secs }
    }
}

impl<S, B> Transform<S, ServiceRequest> for RateLimiter
where
    S: Service<ServiceRequest, Response = ServiceResponse<B>, Error = Error> + 'static,
    B: 'static,
{
    type Response = ServiceResponse<EitherBody<B>>;
    type Error = Error;
    type Transform = RateLimiterMiddleware<S>;
    type InitError = ();
    type Future = Ready<Result<Self::Transform, Self::InitError>>;

    fn new_transform(&self, service: S) -> Self::Future {
        future::ready(Ok(RateLimiterMiddleware {
            service,
            state: self.state.clone(),
            max_requests: self.max_requests,
            window_secs: self.window_secs,
        }))
    }
}

pub struct RateLimiterMiddleware<S> {
    service: S,
    state: std::sync::Arc<Mutex<HashMap<IpAddr, Vec<Instant>>>>,
    max_requests: usize,
    window_secs: u64,
}

impl<S, B> Service<ServiceRequest> for RateLimiterMiddleware<S>
where
    S: Service<ServiceRequest, Response = ServiceResponse<B>, Error = Error> + 'static,
    B: 'static,
{
    type Response = ServiceResponse<EitherBody<B>>;
    type Error = Error;
    type Future = Pin<Box<dyn Future<Output = Result<Self::Response, Self::Error>>>>;

    fn poll_ready(&self, cx: &mut std::task::Context<'_>) -> std::task::Poll<Result<(), Self::Error>> {
        self.service.poll_ready(cx)
    }

    fn call(&self, req: ServiceRequest) -> Self::Future {
        let peer_ip = req.peer_addr().map(|a| a.ip());

        if let Some(ip) = peer_ip {
            let now = Instant::now();
            let window = std::time::Duration::from_secs(self.window_secs);
            let mut state = self.state.lock().unwrap();
            let entries = state.entry(ip).or_default();

            // Remove expired entries
            entries.retain(|t| now.duration_since(*t) < window);

            if entries.len() >= self.max_requests {
                let resp = HttpResponse::TooManyRequests()
                    .insert_header(("Retry-After", self.window_secs.to_string()))
                    .body("rate limit exceeded");
                let sr = req.into_response(resp).map_into_right_body();
                return Box::pin(future::ready(Ok(sr)));
            }

            entries.push(now);
        }

        let fut = self.service.call(req);
        Box::pin(async move {
            let res = fut.await?;
            Ok(res.map_into_left_body())
        })
    }
}

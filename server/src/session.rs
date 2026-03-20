use jsonwebtoken::{encode, decode, Header, Validation, Algorithm, EncodingKey, DecodingKey};
use serde::{Deserialize, Serialize};
use crate::models::RunPayload;

const SESSION_MAX_SECS: u64 = 3600; // 1 hour max session

#[derive(Debug, Serialize, Deserialize)]
struct SessionClaims {
    /// The DB session row ID (UUID string)
    sid: String,
    sub: i64,       // player_id
    iat: u64,
    exp: u64,
}

#[derive(Debug, Deserialize)]
pub struct RunClaims {
    pub player_id: i64,
    pub raw_distance: f64,
    pub orbs_collected: i64,
    pub near_misses: i64,
    pub dashes_used: i64,
    pub walls_broken: i64,
    pub duration_secs: f64,
    pub reached_max_speed: bool,
    pub damage_taken: bool,
}

pub struct AppState {
    jwt_secret: String,
}

impl AppState {
    pub fn new(secret: String) -> Self {
        Self { jwt_secret: secret }
    }

    fn signing_key(&self, wallet_address: &str) -> String {
        format!("{}{}", self.jwt_secret, wallet_address)
    }

    pub fn create_session_token(
        &self,
        session_id: &str,
        player_id: i64,
        wallet_address: &str,
    ) -> Result<String, String> {
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_secs();

        let claims = SessionClaims {
            sid: session_id.to_string(),
            sub: player_id,
            iat: now,
            exp: now + SESSION_MAX_SECS,
        };

        let key = self.signing_key(wallet_address);
        encode(
            &Header::default(),
            &claims,
            &EncodingKey::from_secret(key.as_bytes()),
        )
        .map_err(|e| format!("failed to create session: {e}"))
    }

    /// Validate a session JWT. Returns (session_id, player_id, elapsed_ms).
    pub fn validate_session_token(
        &self,
        token: &str,
        wallet_address: &str,
    ) -> Result<(String, i64, i64), String> {
        let key = self.signing_key(wallet_address);
        let validation = Validation::default();

        let token_data = decode::<SessionClaims>(
            token,
            &DecodingKey::from_secret(key.as_bytes()),
            &validation,
        )
        .map_err(|e| format!("invalid session token: {e}"))?;

        let claims = token_data.claims;
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_secs();

        let elapsed_ms = ((now - claims.iat) * 1000) as i64;
        Ok((claims.sid, claims.sub, elapsed_ms))
    }

    /// Decode the client-signed run JWT using the session token string as HMAC key.
    pub fn decode_run_token(
        &self,
        run_token: &str,
        session_token: &str,
    ) -> Result<RunPayload, String> {
        let mut validation = Validation::new(Algorithm::HS256);
        validation.required_spec_claims = std::collections::HashSet::new();
        validation.validate_exp = false;

        let token_data = decode::<RunClaims>(
            run_token,
            &DecodingKey::from_secret(session_token.as_bytes()),
            &validation,
        )
        .map_err(|e| format!("invalid run token: {e}"))?;

        let c = token_data.claims;
        Ok(RunPayload {
            player_id: c.player_id,
            raw_distance: c.raw_distance,
            orbs_collected: c.orbs_collected,
            near_misses: c.near_misses,
            dashes_used: c.dashes_used,
            walls_broken: c.walls_broken,
            duration_secs: c.duration_secs,
            reached_max_speed: c.reached_max_speed,
            damage_taken: c.damage_taken,
        })
    }
}

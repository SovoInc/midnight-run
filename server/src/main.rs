mod achievement_defs;
mod achievements_api;
mod db;
mod internal_api;
mod metrics_api;
mod models;

use actix_cors::Cors;
use actix_web::{web, App, HttpServer};
use db::Db;

#[actix_web::main]
async fn main() -> std::io::Result<()> {
    let db = Db::new("midnight_runner.db").expect("Failed to open database");
    let db_data = web::Data::new(db);

    println!("Midnight Run server starting on http://localhost:3001");

    HttpServer::new(move || {
        let cors = Cors::default()
            .allow_any_origin()
            .allow_any_method()
            .allow_any_header()
            .max_age(3600);

        App::new()
            .wrap(cors)
            .app_data(db_data.clone())
            .configure(internal_api::config)
            .configure(metrics_api::config)
            .configure(achievements_api::config)
    })
    .bind("127.0.0.1:3001")?
    .run()
    .await
}

mod achievement_defs;
mod achievements_api;
mod db;
mod internal_api;
mod metrics_api;
mod models;

use actix_files::Files;
use actix_web::{web, App, HttpServer};
use db::Db;

#[actix_web::main]
async fn main() -> std::io::Result<()> {
    let db = Db::new("midnight_runner.db").expect("Failed to open database");
    let db_data = web::Data::new(db);

    println!("Midnight Run starting on http://localhost:3001");

    HttpServer::new(move || {
        App::new()
            .app_data(db_data.clone())
            .configure(internal_api::config)
            .configure(metrics_api::config)
            .configure(achievements_api::config)
            .service(Files::new("/", "./static").index_file("index.html"))
    })
    .bind("127.0.0.1:3001")?
    .run()
    .await
}

use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
pub struct Player {
    pub id: i64,
    pub alias: String,
    pub wallet_address: Option<String>,
    pub network_id: String,
    pub created_at: String,
}

#[derive(Debug, Deserialize)]
pub struct AliasRequest {
    pub alias: String,
}

#[derive(Debug, Deserialize)]
pub struct WalletRequest {
    pub wallet_address: String,
    #[serde(default = "default_network")]
    pub network_id: String,
}

fn default_network() -> String {
    "preview".to_string()
}

#[derive(Debug, Deserialize)]
pub struct ScoreSubmission {
    pub player_id: i64,
    pub score: i64,
    pub distance: i64,
    pub orbs_collected: i64,
    pub near_misses: i64,
    pub dashes_used: i64,
    pub walls_broken: i64,
    pub duration_secs: f64,
}

#[derive(Debug, Serialize)]
pub struct ScoreEntry {
    pub rank: i64,
    pub display_name: String,
    pub wallet_address: Option<String>,
    pub score: i64,
    pub distance: i64,
    pub player_id: i64,
}

#[derive(Debug, Serialize)]
pub struct PlayerStats {
    pub total_runs: i64,
    pub total_distance: i64,
    pub total_orbs: i64,
    pub total_dashes: i64,
    pub best_score: i64,
    pub best_distance: i64,
    pub best_near_misses: i64,
    pub best_walls_broken: i64,
    pub best_no_damage_distance: i64,
    pub max_speed_reached: bool,
}

#[derive(Debug, Deserialize)]
pub struct AchievementUnlock {
    pub player_id: i64,
    pub achievement_key: String,
}

#[derive(Debug, Serialize)]
pub struct AchievementRecord {
    pub achievement_key: String,
    pub unlocked_at: String,
}

#[derive(Debug, Deserialize)]
pub struct LimitQuery {
    pub limit: Option<i64>,
    pub network_id: Option<String>,
}

// PRC-6 types

#[derive(Debug, Serialize)]
pub struct MetricsResponse {
    pub name: String,
    pub description: String,
    pub achievements: Vec<MetricAchievement>,
    pub channels: Vec<ChannelDef>,
}

#[derive(Debug, Serialize)]
pub struct MetricAchievement {
    pub name: String,
    #[serde(rename = "displayName")]
    pub display_name: String,
    pub description: String,
    #[serde(rename = "isActive")]
    pub is_active: bool,
    pub score: i64,
    pub category: String,
    #[serde(rename = "percentCompleted", skip_serializing_if = "Option::is_none")]
    pub percent_completed: Option<f64>,
}

#[derive(Debug, Serialize)]
pub struct ChannelDef {
    pub id: String,
    pub name: String,
    pub description: String,
    #[serde(rename = "scoreUnit")]
    pub score_unit: String,
    #[serde(rename = "sortOrder")]
    pub sort_order: String,
}

#[derive(Debug, Deserialize)]
pub struct ChannelQuery {
    #[serde(rename = "startDate")]
    pub start_date: Option<String>,
    #[serde(rename = "endDate")]
    pub end_date: Option<String>,
    pub limit: Option<i64>,
    pub offset: Option<i64>,
    #[serde(rename = "minAchievements")]
    pub min_achievements: Option<i64>,
    pub network_id: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct ChannelRankings {
    pub channel: String,
    #[serde(rename = "startDate", skip_serializing_if = "Option::is_none")]
    pub start_date: Option<String>,
    #[serde(rename = "endDate", skip_serializing_if = "Option::is_none")]
    pub end_date: Option<String>,
    #[serde(rename = "totalPlayers")]
    pub total_players: i64,
    #[serde(rename = "totalScore")]
    pub total_score: f64,
    pub entries: Vec<RankEntry>,
}

#[derive(Debug, Serialize)]
pub struct RankEntry {
    pub rank: i64,
    pub address: String,
    #[serde(rename = "displayName", skip_serializing_if = "Option::is_none")]
    pub display_name: Option<String>,
    pub score: f64,
}

#[derive(Debug, Deserialize)]
pub struct UserQuery {
    pub channel: Option<Vec<String>>,
    #[serde(rename = "startDate")]
    pub start_date: Option<String>,
    #[serde(rename = "endDate")]
    pub end_date: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct UserProfile {
    pub identity: Identity,
    pub achievements: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub channels: Option<serde_json::Value>,
}

#[derive(Debug, Serialize)]
pub struct Identity {
    pub address: String,
    #[serde(rename = "delegatedFrom")]
    pub delegated_from: Vec<String>,
    #[serde(rename = "displayName", skip_serializing_if = "Option::is_none")]
    pub display_name: Option<String>,
}

// PRC-1 types

#[derive(Debug, Serialize)]
pub struct Prc1AchievementList {
    pub id: String,
    pub name: String,
    pub version: String,
    pub block: i64,
    pub caip2: String,
    pub time: String,
    pub achievements: Vec<Prc1Achievement>,
}

#[derive(Debug, Serialize)]
pub struct Prc1Achievement {
    pub name: String,
    #[serde(rename = "displayName")]
    pub display_name: String,
    pub description: String,
    #[serde(rename = "isActive")]
    pub is_active: bool,
    pub score: i64,
    pub category: String,
    #[serde(rename = "percentCompleted", skip_serializing_if = "Option::is_none")]
    pub percent_completed: Option<f64>,
}

#[derive(Debug, Deserialize)]
pub struct Prc1ListQuery {
    pub category: Option<String>,
    #[serde(rename = "isActive")]
    pub is_active: Option<bool>,
    pub network_id: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct Prc1PlayerAchievements {
    pub block: i64,
    pub caip2: String,
    pub time: String,
    pub wallet: String,
    #[serde(rename = "userName", skip_serializing_if = "Option::is_none")]
    pub user_name: Option<String>,
    pub completed: i64,
    pub achievements: Vec<Prc1PlayerAchievement>,
}

#[derive(Debug, Serialize)]
pub struct Prc1PlayerAchievement {
    pub name: String,
    pub completed: bool,
    #[serde(rename = "completedDate", skip_serializing_if = "Option::is_none")]
    pub completed_date: Option<String>,
    #[serde(rename = "completedRate", skip_serializing_if = "Option::is_none")]
    pub completed_rate: Option<CompletedRate>,
}

#[derive(Debug, Serialize)]
pub struct CompletedRate {
    pub progress: f64,
    pub total: f64,
}

/// Server-side score computation and run validation.
///
/// The score formula mirrors the client HUD:
///   floor(raw_distance * 0.04) + orbs_collected * 10 + near_misses * 50

const ORB_SCORE_VALUE: i64 = 10;
const NEAR_MISS_BONUS: i64 = 50;
const MAX_SPEED: f64 = 520.0;

pub struct ComputedScore {
    pub score: i64,
    pub display_distance: i64,
}

pub fn compute_score(raw_distance: f64, orbs_collected: i64, near_misses: i64) -> ComputedScore {
    let display_distance = (raw_distance * 0.04).floor() as i64;
    let score = display_distance + orbs_collected * ORB_SCORE_VALUE + near_misses * NEAR_MISS_BONUS;
    ComputedScore { score, display_distance }
}

pub struct ValidationError {
    pub reason: String,
}

pub fn validate_run(
    raw_distance: f64,
    orbs_collected: i64,
    near_misses: i64,
    dashes_used: i64,
    walls_broken: i64,
    duration_secs: f64,
    session_elapsed_secs: f64,
) -> Result<(), ValidationError> {
    // All values must be non-negative
    if raw_distance < 0.0 || orbs_collected < 0 || near_misses < 0
        || dashes_used < 0 || walls_broken < 0 || duration_secs < 0.0
    {
        return Err(ValidationError { reason: "negative values".into() });
    }

    // Duration vs session elapsed time (reject if claimed > actual + 10s)
    // Session token creation is async and may lag behind the game timer start,
    // so the tolerance must account for network round-trip + Phaser timer drift
    if duration_secs > session_elapsed_secs + 10.0 {
        return Err(ValidationError {
            reason: format!(
                "duration {:.1}s exceeds session elapsed {:.1}s + 10s",
                duration_secs, session_elapsed_secs
            ),
        });
    }

    // Distance vs max theoretical (MAX_SPEED * duration * 1.1)
    let max_distance = MAX_SPEED * duration_secs * 1.1;
    if raw_distance > max_distance {
        return Err(ValidationError {
            reason: format!(
                "distance {:.0} exceeds max theoretical {:.0}",
                raw_distance, max_distance
            ),
        });
    }

    // Near misses rate cap (~1.5/sec + 5)
    let max_near_misses = (duration_secs * 1.5 + 5.0) as i64;
    if near_misses > max_near_misses {
        return Err(ValidationError {
            reason: format!(
                "near_misses {} exceeds rate cap {}",
                near_misses, max_near_misses
            ),
        });
    }

    // walls_broken <= dashes_used
    if walls_broken > dashes_used {
        return Err(ValidationError {
            reason: format!(
                "walls_broken {} > dashes_used {}",
                walls_broken, dashes_used
            ),
        });
    }

    // Dash rate cap (~2.5/sec + 5)
    let max_dashes = (duration_secs * 2.5 + 5.0) as i64;
    if dashes_used > max_dashes {
        return Err(ValidationError {
            reason: format!(
                "dashes_used {} exceeds rate cap {}",
                dashes_used, max_dashes
            ),
        });
    }

    Ok(())
}

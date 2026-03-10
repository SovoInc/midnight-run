import Phaser from "phaser";
import {
  PLAYER_X, GROUND_Y, JUMP_VELOCITY, DOUBLE_JUMP_VELOCITY,
  DASH_DURATION, DASH_COOLDOWN, DOUBLE_JUMP_UNLOCK_DISTANCE,
  GAME_HEIGHT, PLAYER_SCALE, PLAYER_BODY_W, PLAYER_BODY_H,
  PLAYER_OFFSET_X, PLAYER_OFFSET_Y,
  COYOTE_TIME, HIT_STUN_DURATION, HIT_INVULN_DURATION, STARTING_HEALTH,
  HIT_BOUNCE_X, HIT_BOUNCE_Y,
} from "../config";

type PlayerState = "idle" | "run" | "jump" | "midair" | "fall" | "dash" | "hit" | "dead";

export class Player extends Phaser.Physics.Arcade.Sprite {
  private currentState: PlayerState = "idle";
  private canDoubleJump = false;
  private hasDoubleJumped = false;
  private isDashing = false;
  private dashTimer = 0;
  private dashCooldownTimer = 0;
  private isInvulnerable = false;
  private invulnTimer = 0;
  private coyoteTimer = 0;
  private health = STARTING_HEALTH;
  public damageTaken = false;

  constructor(scene: Phaser.Scene) {
    super(scene, PLAYER_X, GROUND_Y - 60, "player-idle");
    scene.add.existing(this as Phaser.GameObjects.GameObject);
    scene.physics.add.existing(this as unknown as Phaser.GameObjects.GameObject);

    this.setScale(PLAYER_SCALE);
    this.setSize(PLAYER_BODY_W, PLAYER_BODY_H);
    this.setOffset(PLAYER_OFFSET_X, PLAYER_OFFSET_Y);
    this.setCollideWorldBounds(false);
    this.setDepth(10);
  }

  setPlayerState(newState: PlayerState) {
    if (this.currentState === "dead") return;
    if (this.currentState === newState) return;
    this.currentState = newState;

    switch (newState) {
      case "idle": this.play("anim-idle"); break;
      case "run": this.play("anim-run"); break;
      case "jump": this.play("anim-jump"); break;
      case "midair": this.play("anim-midair"); break;
      case "fall": this.play("anim-fall"); break;
      case "dash": this.play("anim-dash"); break;
      case "hit": this.play("anim-hit"); break;
      case "dead": this.play("anim-death"); break;
    }
  }

  getState(): PlayerState {
    return this.currentState;
  }

  startRun() {
    this.health = STARTING_HEALTH;
    this.damageTaken = false;
    this.isInvulnerable = false;
    this.invulnTimer = 0;
    this.dashCooldownTimer = 0;
    this.coyoteTimer = 0;
    this.hasDoubleJumped = false;
    this.canDoubleJump = false;
    this.isDashing = false;
    this.setAlpha(1);
    this.setVelocity(0, 0);
    (this.body as Phaser.Physics.Arcade.Body).allowGravity = true;
    this.setPlayerState("run");
  }

  jump(distance: number) {
    if (this.currentState === "dead" || this.currentState === "hit" || this.isDashing) return false;

    const onGround = (this.body as Phaser.Physics.Arcade.Body).blocked.down;
    const canGroundJump = onGround || this.coyoteTimer > 0;

    if (canGroundJump) {
      this.setVelocityY(JUMP_VELOCITY);
      this.setPlayerState("jump");
      this.hasDoubleJumped = false;
      this.canDoubleJump = distance >= DOUBLE_JUMP_UNLOCK_DISTANCE;
      this.coyoteTimer = 0;
      return true;
    } else if (this.canDoubleJump && !this.hasDoubleJumped) {
      this.setVelocityY(DOUBLE_JUMP_VELOCITY);
      this.setPlayerState("jump");
      this.hasDoubleJumped = true;
      return true;
    }
    return false;
  }

  dash(): boolean {
    if (this.currentState === "dead" || this.currentState === "hit") return false;
    if (this.isDashing || this.dashCooldownTimer > 0) return false;

    this.isDashing = true;
    this.isInvulnerable = true;
    this.dashTimer = DASH_DURATION;
    this.setPlayerState("dash");
    return true;
  }

  takeDamage() {
    if (this.isInvulnerable || this.currentState === "dead") {
      return { damaged: false, defeated: false, remainingHealth: this.health };
    }

    this.damageTaken = true;
    this.health = Math.max(0, this.health - 1);

    if (this.health <= 0) {
      this.die();
      return { damaged: true, defeated: true, remainingHealth: this.health };
    }

    this.setPlayerState("hit");
    this.isInvulnerable = true;
    this.invulnTimer = HIT_INVULN_DURATION;
    this.setVelocity(HIT_BOUNCE_X, HIT_BOUNCE_Y);

    this.scene.tweens.add({
      targets: this,
      alpha: { from: 0.3, to: 1 },
      duration: 100,
      repeat: 4,
    });

    return { damaged: true, defeated: false, remainingHealth: this.health };
  }

  die() {
    this.setPlayerState("dead");
    this.setVelocity(0, 0);
    (this.body as Phaser.Physics.Arcade.Body).allowGravity = false;
  }

  isAlive(): boolean {
    return this.currentState !== "dead";
  }

  isDashActive(): boolean {
    return this.isDashing;
  }

  isDashReady(): boolean {
    return !this.isDashing && this.dashCooldownTimer <= 0;
  }

  getHealth(): number {
    return this.health;
  }

  didDoubleJump(): boolean {
    return this.hasDoubleJumped;
  }

  hasFallenOffScreen(): boolean {
    return this.y > GAME_HEIGHT + 100;
  }

  updatePlayer(delta: number) {
    if (this.currentState === "dead") return;

    const body = this.body as Phaser.Physics.Arcade.Body;
    const onGround = body.blocked.down;

    if (onGround) {
      this.coyoteTimer = COYOTE_TIME;
      this.hasDoubleJumped = false;
    } else if (this.coyoteTimer > 0) {
      this.coyoteTimer -= delta;
    }

    if (this.isDashing) {
      this.dashTimer -= delta;
      if (this.dashTimer <= 0) {
        this.isDashing = false;
        this.isInvulnerable = false;
        this.dashCooldownTimer = DASH_COOLDOWN;
        this.setPlayerState(onGround ? "run" : "fall");
      }
    }

    if (this.dashCooldownTimer > 0) {
      this.dashCooldownTimer -= delta;
    }

    if (this.invulnTimer > 0) {
      this.invulnTimer -= delta;
      if (this.invulnTimer <= 0 && !this.isDashing) {
        this.isInvulnerable = false;
      }
    }

    if (!this.isDashing && this.currentState !== "hit") {
      const vy = body.velocity.y;

      if (onGround && this.currentState !== "run") {
        this.setPlayerState("run");
      } else if (!onGround) {
        if (vy < -50 && this.currentState !== "jump") {
          this.setPlayerState("jump");
        } else if (vy > 50 && vy < 200 && this.currentState !== "midair") {
          this.setPlayerState("midair");
        } else if (vy >= 200 && this.currentState !== "fall") {
          this.setPlayerState("fall");
        }
      }
    }

    if (this.currentState === "hit" && this.invulnTimer <= HIT_INVULN_DURATION - HIT_STUN_DURATION) {
      this.setPlayerState(onGround ? "run" : "fall");
    }
  }
}

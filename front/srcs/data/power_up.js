import { getRandomFromObject } from "@/utils/typeutils";
import PhysicsEntity from "@/game/physicsEntity";

export const POWER_UP_TYPES = Object.freeze({
  summon: "SUMMON",
  buff: "BUFF",
  debuff: "DEBUFF",
});

export const POWER_TARGETS = Object.freeze({
  ball: "BALL",
  peddle: "PEDDLE",
});

export const SUMMONS = Object.freeze({
  block: "SUMMON_BLOCK",
  ball: "SUMMON_BALL",
  peddle: "SUMMON_PEDDLE",
});

export const BUFFS = Object.freeze({
  peddleSize: "PEDDLE_SIZE_UP",
  peddleSpeed: "PEDDLE_SPEED_UP",
});

export const DEBUFFS = Object.freeze({
  peddleSize: "PEDDLE_SIZE_DOWN",
  peddleSpeed: "PEDDLE_SPEED_DOWN",
});

export default class PowerUp {

  /** @type {"SUMMON" | "BUFF" | "DEBUFF"} type */
  #_type;

  /** @type {string} */
  #detail;

  #_defaulTargetStatus = null;

  get info() {
    return ({
      type: this.#_type,
      detail: this.#detail 
    });
  }

  /** @type {((target: any) => void)[]} */
  #useCallbacks = [];

  /** @type {((target: any) => void)[]} */
  #revokeCallbacks = [];

  /** @type {number} */
  #_duration;
  get duration() {
    return this.#_duration;
  }

  #_target;
  get target() {
    return this.#_target;
  }

  /**
   * constructor.
   * @param {{
   *  type: "SUMMON" | "BUFF" | "DEBUFF",
   *  duration: number,
   * }} params
   */
  constructor({type, duration}) {

    if (duration <= 0) {
      throw "Invalid duration";
    }
    this.#_type = type;
    this.#_duration = duration;
    this.#_target = null;
    this.#setDetail();
  }

  /** @param {any} target */
  use(target) {
    this.#_target = target;
    
    switch (this.#_type) {
      case(POWER_UP_TYPES.buff):
        this.#useBuff();
        break;
      case(POWER_UP_TYPES.debuff):
        this.#useDebuff();
        break;
    }
    this.#useCallbacks.forEach(callback => {
      callback(target);
    });
  }

  revoke() {

    this.#revokeCallbacks.forEach(callback => {
      callback(this.#_target);
    });
  }

  update(duration) {
    if (this.#_duration == 0)
      return ;
    this.#_duration = Math.max(this.#_duration - duration, 0);
    switch (this.#_type) {
      case (POWER_UP_TYPES.buff):
        this.#updateBuff();
        break;
      case (POWER_UP_TYPES.debuff):
        this.#updateDebuff();
        break;
      case (POWER_UP_TYPES.summon):
        break;
    }
  }

  get isEnd() {
    return this.#_duration == 0;
  }


  /** @param {(target: any) => void} callback */
  setUseCallback(callback) {
    this.#useCallbacks.push(callback);
  }

  /** @param {(target: any) => void} callback */
  setRevokeCallback(callback) {
    this.#revokeCallbacks.push(callback);
  }

  #setDetail() {
    switch (this.#_type) {
      case (POWER_UP_TYPES.summon): 
        this.#detail = getRandomFromObject(SUMMONS);
        break;
      case (POWER_UP_TYPES.buff):
        this.#detail = getRandomFromObject(BUFFS);
        break;
      case (POWER_UP_TYPES.debuff):
        this.#detail = getRandomFromObject(DEBUFFS);
        break;
    }
  }

  #useBuff() {
    if (this.#detail == BUFFS.peddleSize) {
      /** @type {PhysicsEntity} */
      const peddle = this.#_target;
      this.#_defaulTargetStatus = {...peddle.size};
      peddle.size.width *= 2;
    }
    else if (this.#detail == BUFFS.peddleSpeed) {
      /** @type {PhysicsEntity} */
      const peddle = this.#_target;
      this.#_defaulTargetStatus = {...peddle.velocity};
      if (peddle.veolocity.x > 0) {
        peddle.veolocity.x += 1;
      }
      else {
        peddle.veolocity.x -= 1;
      }
    }
  }

  #updateBuff() {
    if (this.#detail == BUFFS.peddleSpeed) {
      /** @type {PhysicsEntity} */
      const peddle = this.#_target;
      peddle.velocity.x *= 1.1;
    }

  }

  #useDebuff() {
    if (this.#detail == DEBUFFS.peddleSize) {
      /** @type {PhysicsEntity} */
      const peddle = this.#_target;
      this.#_defaulTargetStatus = {...peddle.size};
      peddle.size.width *= 0.5;
    }
    else if (this.#detail == DEBUFFS.peddleSpeed) {
      /** @type {PhysicsEntity} */
      const peddle = this.#_target;
      this.#_defaulTargetStatus = {...peddle.velocity};
      if (peddle.veolocity.x > 0) {
        peddle.veolocity.x = Math.max(peddle.veolocity.x - 1, 0);
      }
      else {
        peddle.veolocity.x = Math.min(paddle.velocity.x + 1, 0);
      }
    }
  }

  #updateDebuff() {
    if (this.#detail == DEBUFFS.peddleSpeed) {
      /** @type {PhysicsEntity} */
      const peddle = this.#_target;
      if (peddle.velocity.x > 0) {
        peddle.velocity.x = Math.min(peddle.velocity.x , 2);
      }
      else {
        peddle.velocity.x = Math.max(peddle.velocity.x , -2);
      }
    }

  }
}

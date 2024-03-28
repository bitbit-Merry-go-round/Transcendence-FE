import { Vector2, Vector3 } from "three";


export const AnimationCurves = {
  smoothstep: (t) => {
    return t * t * (3 - 2 * t);
  },
  easein: (t) => {
    return 1 - Math.cos(t * Math.PI * 0.5);
  },
  easeout: (t) => {
    return Math.sin(t * Math.PI * 0.5);
  },
  linear: (t) => {
    return t;
  }
}

const TYPES = Object.freeze({
  vector3: "VECTOR3",
  vector2: "VECTOR2",
  scala: "SCALA",
});

/**
 * Animation.
 */
export class Animation {

  /** @type {Vector3 | Vector2 | number} */ 
  #start;
  /** @type {Vector3 | Vector2 | number} */
  #end;
  /** @type {boolean} */
  #repeat
  /** @type {(number) => number} */
  #curve;
  #_type;

  /** @type {Vector3 | Vector2 | number} */
  #dir;
  /** @type {number} */
  #_progress = 0;
  /** @type {number} */
  #_passed = 0;

  /** @type {number} */
  #length
  /** @type {string} */
  key;


  /**
   * constructor.
   * @param {{
   *  start: Vector3 | Vector2 | number,
   *  end: Vector3 | Vector2 | number,
   *  repeat: boolean,
   *  key?: string,
   *  curve: (t: number) => number,
   * }} params
   */
  constructor({start, end, repeat, key = "", curve}) {
    this.#start = start;  
    this.#end = end;
    this.#repeat = repeat;
    if (start instanceof Vector3 && end instanceof Vector3) {
      this.#dir = new Vector3().subVectors(end, start);
      this.#length = this.#dir.length();
      this.#dir.normalize();
      this.#_type = TYPES.vector3;
    }
    else if (start instanceof Vector2 && end instanceof Vector2) {
      this.#dir = new Vector2().subVectors(end, start);
      this.#length = this.#dir.length();
      this.#dir.normalize();
      this.#_type = TYPES.vector2;
    }
    else if (typeof start === "number" 
      && typeof end === "number") {
      this.#length = Math.abs(start - end);
      this.#dir = start > end ? -1: 1;
      this.#_type = TYPES.scala;
      ;
    }
    else {
      throw "start, end type different";
    }
    this.#curve = curve;
    this.key = key;
  }

  /** @param {number} delta*/
  proceed(delta) {
    this.#_progress += delta;
    this.#_progress = Math.min(this.#_progress, 1);
    if (this.#repeat) { //@ts-ignore
      this.#_progress *= (this.#_progress < 1);
    }
    this.#_passed = this.#curve(this.#_progress);
  }

  get current() {
    const scaled = this.#_passed * this.#length;
    switch (this.#_type) {
      case TYPES.scala: //@ts-ignore
        return this.#start + this.#dir * scaled; 
      case TYPES.vector2: 
        return ({ //@ts-ignore
          x: this.#start.x + this.#dir.x * scaled,//@ts-ignore
          y: this.#start.y + this.#dir.y * scaled,
        });
        case TYPES.vector3:
        return ({//@ts-ignore
          x: this.#start.x + this.#dir.x * scaled,//@ts-ignore
          y: this.#start.y + this.#dir.y * scaled,//@ts-ignore
          z: this.#start.z + this.#dir.z * scaled
        });
      default:
        break;
    }
  }

  /** @returns {boolean} */
  get isFinished() {
    return (this.#_progress >= 1);
  }

  /** @returns {number} */
  get progress() {
    return (this.#_progress);
  }
}

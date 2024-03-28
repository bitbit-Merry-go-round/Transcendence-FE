//@ts-nocheck
/**
 * ObservableObject wrapper
 */
export default class ObservableObject {
  
  /** @param {any} object */
  constructor(object) {
    const inner = new _ObservableObject(object);
    const proxy = new Proxy(inner, {
      /** @param {_ObservableObject} obj */
      get: (obj, prop) => {
        if (typeof obj[prop] === 'function')
          return obj[prop].bind(inner);
        if (typeof prop === "string")
          return obj.getValue(prop); 
        else 
          return obj[prop];
      },
      /** @param {_ObservableObject} obj */
      set: (obj, prop, newValue) => {
        if (typeof obj[prop] === "function") {
          return false;
        }
        else if (typeof prop === "string") {
          obj.setValue(prop, newValue);    
          return true;
        }
        return false;
      },
      getPrototypeOf: () => {
        return ObservableObject;
      }
    })
    return proxy;
  }

  /**
   * @param {string} key
   * @param {(value: any) => void} listener
   */
  subscribe(key, listener) { }
  /**
   * @params {{ key: string, id: Number }}
   */
  unSubscribe({key, id}) {}
}


/**
 * Observable value of object by key
 */
class _ObservableObject {

  #object;

  /**
   * @type {{
   * [key: string]: {
   *  id: Number,
   *  callback: (value: any) => void
   * }[]
   * }}
   */
  #listeners;

  /** @type {Number} */
  $listenerId = 0;

  static MAX_LISTENER = 50;

  /** @param {any} object */
  constructor(object) {
    this.#object = object;
    this.#listeners = {};
  }

  /** @param {string} key */
  getValue(key) {
    if (this.#object[key] && 
      typeof this.#object[key] === "function") {
      return this.#object[key].bind(this.#object)
    }
    if (this.#object.hasOwnProperty(key)) {
      return this.#object[key]; 
    }
    if( Object.getPrototypeOf(this.#object).hasOwnProperty(key)) {
      return this.#object[key];
    }
    return null;
  }

  /**
   * @param {string} key
   * @param {any} value
   */
  setValue(key, value) {
    if (this.#object.hasOwnProperty(key) && 
    this.#object[key] != value) {
      this.#object[key] = value;
      this.valueChanged(key);
    }
    else {
      this.#object[key] = value;
    }
  }
  
  /** @param {string} key */
  valueChanged(key) {
    if(this.#listeners.hasOwnProperty(key)) {
      this.#listeners[key].forEach(e => 
        e.callback(this.#object[key])
      ) 
    }
  }

  #sumNumberOfLisetners() {
    let sum = 0;
    for (const key in this.#listeners) {
      sum += this.#listeners[key].length;
    }
    return sum;
  }
  
  /**
   * @param {string} key
   * @param {(value: any) => void} listener
   */
  subscribe(key, listener) {
    if (this.#sumNumberOfLisetners() >= _ObservableObject.MAX_LISTENER) {
      console.error("max listener is exceeded");
      return -1;
    }
    if (!this.#listeners.hasOwnProperty(key)) {
      this.#listeners[key] = [];
    }
    const id = this.$listenerId++;
    this.#listeners[key].push({
      id,
      callback: listener
    });
    return id;
  }

  /**
   * @params {{ key: string, id: Number }}
   */
  unSubscribe({key, id}) {
    if (!this.#listeners.hasOwnProperty(key)) {
      return ;
    }
    const found = this.#listeners[key].findIndex(
      e => e.id == id
    );
    if (found != -1) {
      this.#listeners[key].splice(found, 1);
    }
  }
}

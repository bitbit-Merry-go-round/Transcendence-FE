
/**
 * @param {Object} obj
 * @returns boolean
 */
export function isEmptyObject(obj) {
  return (Object.keys(obj).length === 0 
    && obj.constructor === Object);
}


/**
 * @param {Object} obj
 * @return {{ key: string, value: any }}
 */
export function getRandomFromObject(obj) {
  const keys = Object.keys(obj);
  if (keys.length == 0) {
    throw "object is empty";
  }
  const key = keys[
    Math.floor(Math.random() * keys.length)
  ];

  return {key, value: obj[key]};
}


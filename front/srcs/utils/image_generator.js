
export default class ImageGenerator {

  /** @type {HTMLCanvasElement} */
  #canvas;
  #ctx;
  #size;
  #xmlSerializer = new XMLSerializer();
  #needClean = false;

  constructor({size}) {
    this.#canvas = document.createElement("canvas");
    this.#canvas.width = size.width;
    this.#canvas.height = size.height;
    this.#ctx = this.#canvas.getContext("2d");
    this.#size = size;
  }

  generate(html) {
    const data = encodeURIComponent(this.#createSvg(html));
    const promise = new Promise(resolve => {
      const containerImage = document.createElement("img");
      containerImage.onload = () => { 
        this.draw(containerImage);
        resolve(this.#canvas);
      };
      containerImage.src = "data:image/svg+xml," + data;
    })
    return promise;
  }

  draw(image) {
    if (this.#needClean) {
      this.#ctx.clearRect(0, 0, this.#size.width, this.#size.height);
      this.#needClean = false;
    }
    this.#ctx.drawImage(image, 0, 0, this.#size.width, this.#size.height);
    this.#needClean = true;
    return this.#canvas;
  }

  #createSvg(html) {
    return (
      `<svg xmlns="http://www.w3.org/2000/svg" width="${this.#size.width}" height="${this.#size.height}">` +
      '<foreignObject width="100%" height="100%">' +
      this.#xmlSerializer.serializeToString(html) +
      '</foreignObject>' +
      '</svg>');
  }

  #toBlob({type, quality}) {
    const binStr = atob(this.#canvas.toDataURL(type, quality).split(',')[1]);
    const len = binStr.length;
    const arr = new Uint8Array(len);

    for (let i = 0; i < len; ++i) {
      arr[i] = binStr.charCodeAt(i);
    }
    return new Blob([arr], {type: type || "image/png"});
  }
}

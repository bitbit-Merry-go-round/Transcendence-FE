import * as THREE from "three";

function hexToRGB(hex) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);

  return [r, g, b];
}

/**
 * Particles.
 */
export default class ParticleGenerator {


  /** @type {THREE.Group} */
  #particleContainer;

   /** @type {THREE.Texture[]} */
  #particlesTextures = [];

  /** @type {THREE.TextureLoader} */
  textureLoader;

  /** @type {number} */
  count;

  /** @type {number} */
  particleSize;

  /** @type {THREE.Points} */
  #particles;

  /** @type {boolean} */
  isPlaying;

  /** @type{{
      position: {
        x: number, 
        y: number, 
        z: number
      },
      time: number,
      speed: number,
      factor: number
    }[]}
    */
  particleData = [];
  /** @type {boolean}} */
  computeDepth; 

  /** @type {{
      x: number, 
      y: number, 
      z: number
    }}
    */
  maxSize;

  /** @type {number[][] | null} */
  #colors = null;

  animationConfig = {
    speedCoefficient: 0.01,
    speedVariantConstant: 100,
    speedVariantCoefficient: 0.01,
  }

  /**
   * constructor.
   *
   * @params {{
   *   textureLoader: THREE.TextureLoader,
   *   size: {
   *    x: number,
   *    y: number,
   *    z: number
   *   },
   *   count: number,
   *   particleSize: number,
   *   maxSize?: {
   *    x: number,
   *    y: number,
   *    z: number
   *   },
   *   computeDepth: boolean = false
   * }}
   */
  constructor({
    textureLoader,
    count,
    particleSize,
    maxSize = null,
    computeDepth = false,
  }) {
    this.textureLoader = textureLoader;
    this.count = count;
    this.particleSize = particleSize;
    this.#particleContainer = new THREE.Group();
    this.maxSize = maxSize;
    this.computeDepth = computeDepth
    this.isPlaying = true;
  }

  /** @param {string[]} colors */
  setColor(colors) {
    this.#colors = colors.map(c => {
      if (c[0] != "#") {
        return (hexToRGB("#" + c.toLowerCase()));
      }
      return hexToRGB(c.toLowerCase());
    })
  }

  /** createParticles. */
  createParticles() {

    const buffer = new THREE.BufferGeometry()
    const vertices = new Float32Array(this.count * 3);
    const colors = this.#colors ? new Uint8Array(this.count * 3): new Float32Array(this.count * 3);
    for (let i3 = 0; i3 < this.count; ++i3) {
      //xyz
      const x =  (Math.random() - 0.5) * (this.maxSize?.x ?? 1);
      const y = (Math.random() - 0.5) * (this.maxSize?.y ?? 1);
      const z = (Math.random() - 0.5) * (this.maxSize?.z ?? 1);
      vertices[i3] = x;
      vertices[i3 + 1] = y;
      vertices[i3 + 2] = z;

      // rgb
      if (this.#colors) {
        const color = this.#colors[i3 % this.#colors.length];
        colors[i3 ] = color[0];
        colors[i3 + 1]  = color[1];
        colors[i3 + 2]  = color[2];
      }
      else {
        colors[i3] = Math.random(); 
        colors[i3 + 1] = Math.random();
        colors[i3 + 2] = Math.random();
      }

      //animate

      const time = Math.random() * 100;
      const speed = Math.random() * this.animationConfig.speedCoefficient;
      const factor = Math.random() * this.animationConfig.speedVariantCoefficient + this.animationConfig.speedVariantConstant; 

      this.particleData.push({
        position: {
          x, y, z
        },
        time,
        speed,
        factor
      });
    }

    buffer.setAttribute("position",
      new THREE.BufferAttribute(vertices, 3)
    );
    buffer.setAttribute("color",
      new THREE.BufferAttribute(colors, 3)
    )
    const material = new THREE.PointsMaterial({
      transparent: true,
      size: this.particleSize,
      depthTest: this.computeDepth,
      depthWrite: this.computeDepth,
      blending: THREE.AdditiveBlending,
      vertexColors: true,
      sizeAttenuation: true
    });
    this.#particles = new THREE.Points(buffer, material);
    this.#particleContainer.add(this.#particles);
    return this;
  }

  getParticles() {
    return this.#particleContainer;
  }

  remove() {
    this.#particles.removeFromParent();
    this.#particleContainer.remove();
  }

  /**
   * animate.
   */
  animate() {
    if (!this.isPlaying)
      return;

    for (let i = 0; i < this.count; ++i) {
      const data = this.particleData[i];
      const { position, factor } = data;
    
      const t = (data.time += data.speed);
      
      position.x += (Math.cos((t * 0.1) * factor) + (Math.sin(t * 1) * factor)) * 0.001;
      position.y += (Math.sin((t * 0.1) * factor) + (Math.cos(t * 2) * factor)) * 0.001;
      position.z += (Math.cos((t * 0.1) * factor) + (Math.sin(t * 3) * factor)) * 0.001; //@ts-ignore: performance
      if (this.maxSize) {
        position.x *= 1 - (Math.abs(position.x) > this.maxSize.x) //@ts-ignore: performance
        position.y *= 1 - (Math.abs(position.y) > this.maxSize.y) //@ts-ignore: performance
        position.z *= 1 - (Math.abs(position.z) > this.maxSize.z)

      }
      const i3 = i * 3;
      this.#particles.geometry.attributes.position.array[i3] = position.x;
      this.#particles.geometry.attributes.position.array[i3 + 1] = position.y;
      this.#particles.geometry.attributes.position.array[i3 + 2] = position.z;
    }

    this.#particles.geometry.attributes.position.needsUpdate = true;
  }
}


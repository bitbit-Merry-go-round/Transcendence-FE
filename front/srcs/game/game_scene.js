import * as THREE from "three";
import Physics from "@/game/physics";
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls'
import PhysicsEntity from "@/game/physicsEntity";
import { EPSILON } from "@/game/physicsUtils";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader";
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader'
import { GameData, Player } from "@/data/game_data";
import ParticleGenerator from "@/game/particleGenerator";
import ObservableObject from "@/lib/observable_object";
import GUI from "node_modules/lil-gui/dist/lil-gui.esm.min.js";

const FRAME_TIME_THRESHOLD = 0.01;
const MAX_PEDDLE_SPEED = 50;
const PEDDLE_ACCEL = 10;
const PEDDLE_DECEL_RATIO = 0.5;
const SOUND_EFFECT_THRESHOLD = 0.3;

const WALL_TYPES = Object.freeze({
  safeWall: "SAFE",
  trapWall: "TRAP",
});

const DIRECTION = Object.freeze({
  top: "TOP",
  bottom: "BOTTOM",
  left: "LEFT",
  right: "RIGHT"
});

const PLAYER_POSITION = Object.freeze({
  [DIRECTION.top]: 0,
  [DIRECTION.bottom]: 1,
});

/** @type {{
 *    [key: string] : {
 *      player: number,
 *      x: number,
 *      y: number,
 *    }
 *  }}
 */
const controlMap = {
  "ArrowLeft": {
    player: 0,
    x: -1,
    y: 0,
  },
  "ArrowRight": {
    player: 0, 
    x: 1,
    y: 0,
  },
  "-": {
    player: 1, 
    x: -1,
    y: 0,
  },
  "=": {
    player: 1, 
    x: 1,
    y: 0,
  },
};

/**
 * Game Scene.
 */
export default class Scene {

  #physics;
  #scene;
  #scene_objs = {};
  #gameData;

  #textureLoader = new THREE.TextureLoader();
  /** @type {"TOP" | "BOTTOM" | null} */
  #lostSide = null;

  #gameSize = {
    width: 100,
    height: 100,
    depth: 1
  };

  #depth = {
    wall: 1,
    peddle: 0.5
  };

  #gameScene;
  #canvas;
  #windowSize;
  /** @type {THREE.PerspectiveCamera} */
  #camera;
  /** @type {HTMLAudioElement} */
  #bgm;

  /** @type {THREE.WebGLRenderer} */
  #renderer;

  /** @type {{
   * ambientLight: THREE.AmbientLight,
   * directionalLight: THREE.DirectionalLight
   * }} */ //@ts-ignore: setLights
  #lights = {};

  lightConfigs = {
    ambientColor: 0xffffff,
    ambientIntensity: 2.1,
    directionalColor: 0xffffff,
    directionalIntensity: 2.1
  }

  /** @type {{
   *   clock: THREE.Clock,
   *   elapsed: number
   * }} */
 #time;

  /** @type {Array<{
   *    mesh: THREE.Mesh,
   *    physicsId: number
   *  }>}
   */
  #objects = [];

  /**
   * @type {{
   *  mesh: THREE.Mesh | null,
   *  physicsId: number | null,
   * }} 
   */
  #ball = { mesh: null, physicsId: null };

  ballColor = 0xff0000;
  #ballRadiusInGame = 0.03;
  #ballSpeed = 30;
  #ballStartDirection = {
    x: DIRECTION.left,
    y: DIRECTION.bottom
  };

  /**
   * @type {{
   *  [key: number]: THREE.Mesh // physicsId: Mesh
   * }} 
   */
  #walls = {}; 
  #wallTextureRepeat = 10;
  
  /** @type {number} */
  wallColor = 0x00ff00;

  /** @type {{
   *    mesh: THREE.Mesh,
   *    physicsId: number
   *  }[]}
   */
  #peddles = [];

  peddleColors = {
    "player1": 0x00ffff,
    "player2": 0xffff00,
  };

  peddleSizeInGame = {
    width: 0.15,
    height: 0.015
  }

  /** @type {number[]} */
  #eventsIds = [];

  #hitSound = {
    sound: new Audio("assets/sound/hit.mp3"),
    lastPlayed: 0,
    volume: 0.8
    };

  /** @type {ParticleGenerator} */
  #particleGenerator;

  /** @type {{
   *    pressed: {
   *      player: number,
   *      x: number,
   *      y: number,
   *      key: string | null,
   *    }
   *   }[]}
   */
  #peddleControls = [
    {
      pressed: {
        player: 0,
        x: 0,
        y: 0,
        key: null
      }
    }, 
    {
      pressed: {
        player: 1,
        x: 0,
        y: 0,
        key: null
      }
    }
  ];

  isBallMoving = false;
  #renderId = 0;

  /**
   * @params {Object} params
   * @param {{
   *  canvas: HTMLCanvasElement,
   *  gameData: ObservableObject,
   * }} params
   */
  constructor({canvas, gameData}) {
    this.#canvas = canvas;
    this.#gameData = gameData;
    this.#scene = new THREE.Scene();

    this.#gameScene = new THREE.Group();
    this.#windowSize = {
      width: canvas.width,
      height: canvas.height
    };
    this.#physics = new Physics();
    this
      .#load()
      .#init()
      .#setGameBackground()
      .#addObjects()
      .#addControls()
      .#addEvents()
      .#addHelpers()
      .#startRender();
  }

  prepareDisappear() {

  }

  #load() {

    // Model
    const gltfLoader = new GLTFLoader();
    gltfLoader.load(
      "assets/scene/game_scene.glb",
      (gltf) => {
        
        const game_scene = gltf.scene;
        game_scene.scale.set(2, 2, 2);
        game_scene.children.forEach(obj =>  {
          this.#scene_objs[obj.name] = obj;
        });

        /** @type {THREE.Mesh} */
        const keyboard = this.#scene_objs["keyboard"];
        keyboard.scale.x *= -1;


        /** @type {THREE.Mesh} */
        const mac = this.#scene_objs["macintosh"];
        /** @type {THREE.Mesh} */
        let screen;
        mac.traverse(obj => {
          if (obj.name == "screen") //@ts-ignore
            screen = obj
        });
        console.log(this.#scene_objs)
        const screenBox= new THREE.Box3().setFromObject(screen);
        const screenSize = {
          x: screenBox.max.x - screenBox.min.x,
          y: screenBox.max.y - screenBox.min.y,
          z: screenBox.max.z - screenBox.min.z
        };

        const sceneBox = new THREE.Box3().setFromObject(this.#gameScene);
        const sceneSize = {
          x: sceneBox.max.x - sceneBox.min.x,
          y: sceneBox.max.y - sceneBox.min.y,
          z: sceneBox.max.z - sceneBox.min.z
        };

        this.#gameScene.position.copy(screen.position)

         this.#gameScene.scale.set(
           (screenSize.x / sceneSize.x) * 0.8,
           (screenSize.y / sceneSize.y) * 0.7,
           (screenSize.z / sceneSize.z) * 5 
         );

        screen.parent.add(this.#gameScene);
        screen.removeFromParent();

        this.#camera.position.set(
          0.34,
          2.6,
          3
        );
        this.#camera.rotation.set(
          -0.46,
          0.09,
          0.04
        );
           
        this.#scene.add(game_scene);
      },
      (progress) => {
      },
      (error) => {
        console.error(error);
      }
    )
    /*
    gltfLoader.load(
      "assets/macintosh/scene.glb",
      (gltf) => {
        const model = gltf.scene;
        model.scale.set(25, 25, 25);
        const root = model.children[0].children[0].children[0];
        const screen = root.children[1];
        const screenBox= new THREE.Box3().setFromObject(screen);
        const screenSize = {
          x: screenBox.max.x - screenBox.min.x,
          y: screenBox.max.y - screenBox.min.y,
          z: screenBox.max.z - screenBox.min.z
        };

        const sceneBox = new THREE.Box3().setFromObject(this.#gameScene);
        const sceneSize = {
          x: sceneBox.max.x - sceneBox.min.x,
          y: sceneBox.max.y - sceneBox.min.y,
          z: sceneBox.max.z - sceneBox.min.z
        };

        this.#gameScene.position.copy(screen.position)

         this.#gameScene.scale.set(
           (screenSize.x / sceneSize.x) * 0.8,
           (screenSize.y / sceneSize.y) * 0.7,
           (screenSize.z / sceneSize.z) * 5 
         );

        screen.parent.add(this.#gameScene);
        screen.removeFromParent();
        this.#scene.add(model);
      },
      (_) => {
      },
      (error) => {
        console.error("load error", error);
      }
    )

    // Background
    const rgbeLoader = new RGBELoader();
    rgbeLoader.load("assets/night_field.hdr",
      (environmentMap) =>
      {
        environmentMap.mapping = THREE.EquirectangularReflectionMapping;

        this.#scene.background = environmentMap;
        this.#scene.environment = environmentMap;
        this.#scene.backgroundBlurriness = 0.1;
        this.#scene.backgroundIntensity = 1;
      })
    */

    // bgm
    this.#bgm = new Audio("assets/sound/bgm1.mp3");
    this.#bgm.volume = 0.2;
    this.#bgm.play()


    return this;
  }

  startGame() {
    this.#addBall();
    this.isBallMoving = true;
  }

  #init() {
    this.#setLights()
      .#setCamera()
      .#setRenderer()
      .#addResizeCallback()
      .#addVisibleCallback()
      .#setTime()
    return this;
  }

  #addObjects() {
    this.#addWalls()
      .#addPeddles()
    return this;
  }

  #addBall() {
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(1, 16, 16),
      new THREE.MeshStandardMaterial({
        color: this.ballColor,
        metalness: 0.3,
        roughness: 0.4
      })
    );
    mesh.position.set(0, 0, 0);
    const ballWidth = this.#gameSize.width * this.#ballRadiusInGame;
    const ballHeight = this.#gameSize.height* this.#ballRadiusInGame;

    const ballPhysics = PhysicsEntity.createCircle({
      type: "MOVABLE",
      collideType: "DYNAMIC",
      radius: Math.max(ballWidth, ballHeight),
      center: { x: 0, y:0 }
    });
    ballPhysics.veolocity = {
      x: (this.#ballStartDirection.x == DIRECTION.right? 1 : -1) * this.#ballSpeed,
      y: (this.#ballStartDirection.y == DIRECTION.top? 1 : -1) * this.#ballSpeed,
    };
    const physicsId = this.#physics.addObject(ballPhysics)[0];

    this.#objects.push(
      {
        mesh,
        physicsId
      },
    );
    this.#gameScene.add(mesh);
    this.#ball = {
      mesh,
      physicsId,
    };
    return this;
  }

  #addWalls() {
    const safeWalls = this.#addWall({ 
      width: this.#gameSize.width * 0.05,
      height: this.#gameSize.height 
    }, 
      [
        { x: this.#gameSize.width * -0.5, y: 0, z: this.#depth.wall * 0.55 },
        { x: this.#gameSize.width * 0.5, y: 0, z: this.#depth.wall * 0.55 }
      ]
    );

    safeWalls[0].data = {
      wallType: WALL_TYPES.safeWall,
      direction: DIRECTION.left,
    };

    safeWalls[1].data = {
      wallType: WALL_TYPES.safeWall,
      direction: DIRECTION.right,
    };

    const trapWalls = this.#addWall({
      width: this.#gameSize.width * 1, 
      height:this.#gameSize.height* 0.05, 
    },
      [
        { x: 0, y: this.#gameSize.height * -0.5, z: this.#depth.wall * 0.5 },
        { x: 0, y: this.#gameSize.height * 0.5, z: this.#depth.wall * 0.5 }
      ]
    );

    trapWalls[0].data = {
      wallType: WALL_TYPES.trapWall,
      direction: DIRECTION.top
    };

    trapWalls[1].data = {
      wallType: WALL_TYPES.trapWall,
      direction: DIRECTION.bottom
    };
    return this;
  }

  #resizeTexture({texture, x, y}) {
    texture.repeat.x = x;
    texture.repeat.y = y;
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.magFilter = THREE.LinearFilter; 
    texture.minFilter = THREE.NearestMipMapLinearFilter;
  }

  #createMaterialFromTexture(name, onLoad = (texture) => {}) {

    const colorTexture = this.#textureLoader.load(
      `assets/textures/${name}/diff.jpg`,
      onLoad
    )

    const normalTexture = this.#textureLoader.load(
      `assets/textures/${name}/nor.png`,
      onLoad
    );

    const aoRoughnessMetallnessTexture = this.#textureLoader.load(
      `assets/textures/${name}/arm.jpg`,
      onLoad
    );

    const material = new THREE.MeshStandardMaterial({
      map: colorTexture,
      normalMap: normalTexture,
      aoMap: aoRoughnessMetallnessTexture,
      roughnessMap: aoRoughnessMetallnessTexture,
      metalnessMap: aoRoughnessMetallnessTexture,
    });

    return material;
  }

  /** @param {{
   *   width: number,
   *   height: number
   * }} wallSize
   * @param {{
   *   x: number,
   *   y: number,
   *   z: number
   * }[]} wallPositions
   */
  #addWall(wallSize, wallPositions) {

    const geometry = new THREE.BoxGeometry(wallSize.width, wallSize.height, this.#depth.wall);
    const material = this.#createMaterialFromTexture("brick", 
      (texture) => {
        this.#resizeTexture({
        texture,
          x: 1 / wallSize.height * this.#wallTextureRepeat,
          y: 1 / wallSize.width * this.#wallTextureRepeat,
      })
      }
    ) 

    const meshes = wallPositions.map(pos =>  {
      const mesh = new THREE.Mesh(
        geometry, 
        material
      );
      mesh.position.set(pos.x, pos.y, pos.z);
      return mesh;
    });

    const physics = wallPositions.map(pos => {
      return PhysicsEntity.createRect({
        type: "IMMOVABLE",
        width: wallSize.width,
        height: wallSize.height,
        center: {
          x: pos.x, 
          y: pos.y
        }
      });
    });
    const physicsIds = this.#physics.addObject(...physics);
    for (let i = 0; i < physicsIds.length; ++i) {
      this.#objects.push(
        {
          mesh: meshes[i],
          physicsId: physicsIds[i]
        },
      );
      this.#walls[physicsIds[i]] = meshes[i];
    }
    this.#gameScene.add(...meshes);
    return physics;
  }

  #addPeddles() {
    const size = {
      width: this.#gameSize.width * this.peddleSizeInGame.width,
      height: this.#gameSize.height * this.peddleSizeInGame.height,
    };

    const geometry = new THREE.BoxGeometry(
      size.width,
      size.height,
      this.#depth.peddle
    );

    const materials = Object.entries(this.peddleColors).map(([_, color]) => {
      return new THREE.MeshStandardMaterial({
        color: color,
        metalness: 0.3,
        roughness: 0.5,
      })
    })

    const positions = [
      {
        x: 0,
        y: this.#gameSize.height * - 0.4
      },
      {
        x: 0,
        y: this.#gameSize.height * 0.4
      }
    ];
    const meshes = materials.map((material, index) => {
      const mesh = new THREE.Mesh(
        geometry,
        material
      );
      const pos = positions[index];
      mesh.position.set(pos.x, pos.y, this.#depth.peddle * 0.5);
      return mesh;
    });

    const physicsEntities = positions.map(pos => 
      PhysicsEntity.createRect({
        type: "MOVABLE",
        width: size.width,
        height: size.height,
        center: {
          x: pos.x,
          y: pos.y
        }
      })
    );
    const physicsIds = this.#physics.addObject(...physicsEntities);
    for (let i = 0; i < physicsIds.length; ++i) {
      this.#objects.push({
        mesh: meshes[i],
        physicsId: physicsIds[i]
      });
      this.#peddles.push({
        mesh: meshes[i],
        physicsId: physicsIds[i]
      })
    };
    this.#gameScene.add(...meshes);
  }

  #setLights() {

    const gameAmbientLight = new THREE.AmbientLight(this.lightConfigs.ambientColor, this.lightConfigs.ambientIntensity);
    const gameDirectionalLight = new THREE.DirectionalLight(
      this.lightConfigs.directionalcolor,
      this.lightConfigs.directionalIntensity
    );
    gameDirectionalLight.castShadow = true;
    gameDirectionalLight.shadow.mapSize.set(1024, 1024);
    gameDirectionalLight.shadow.camera.far = 15;
    gameDirectionalLight.position.set(0, 0, 1);
    this.#gameScene.add(gameAmbientLight, gameDirectionalLight);
    this.#lights.ambientLight = gameAmbientLight;
    this.#lights.directionalLight = gameDirectionalLight;
    return this;
  }

  #setGameBackground() {

    const size = {
      x: this.#gameSize.width * 0.8,
      y: this.#gameSize.height * 0.8,
      z: this.#gameSize.depth * 0.5
    };

    /*
    const container = new THREE.Mesh(
      new THREE.BoxGeometry(this.#gameSize.width, this.#gameSize.height, size.z),
      new THREE.MeshBasicMaterial({
        transparent: true,
        opacity: 0,
        depthWrite: false
      })
    );
    container.position.setZ(size.z);

    this.#particleGenerator = new ParticleGenerator({
      textureLoader: this.#textureLoader,
      count: 10,
    });
    this.#particleGenerator.createParticles();
    const particles = this.#particleGenerator.getParticles();
    particles.scale.set(
      20,
      20,
      1
    );

    particles.position.setZ(size.z * -0.8);
    container.add(particles);
    this.#gameScene.add(container);
    */
    return this;
  }

  #setCamera() {
    this.#camera = new THREE.PerspectiveCamera(
      75,
      this.#windowSize.width / this.#windowSize.height,
      0.1,
      100
    );
    this.#camera.position.set(0, 0, 20);
    this.controls = new OrbitControls(this.#camera, this.#canvas)
    this.controls.enableDamping = true
    return this;
  }

  #setRenderer() {
    this.#renderer = new THREE.WebGLRenderer({
      canvas: this.#canvas,
      alpha: true,
      antialias: true
    });
    this.#renderer.shadowMap.enabled = true;
    this.#renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.#renderer.setSize(this.#windowSize.width, 
      this.#windowSize.height);
    this.#renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    return this;
  }

  #addResizeCallback() {
    const resizeCallback = (() => {

      const width = this.#canvas.parentElement.offsetWidth;
      const height = this.#canvas.parentElement.offsetHeight;

      this.#windowSize = {
        width,
        height,
      };

      this.#camera.aspect = width / height;
      this.#camera.updateProjectionMatrix();
      this.#renderer.setSize(width, height);
      this.#renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    }).bind(this);
    window.addEventListener("resize", () => resizeCallback()) 
    return this;
  }

  #addVisibleCallback() {

    const onVisibilityChange = ( /** @param {Boolean} visible */ (visible) => {
      this.isBallMoving = visible;
      if (visible) {
        this.#startRender();         
      }
      else {
        window.cancelAnimationFrame(this.#renderId);
      }
    }).bind(this);

    document.addEventListener("visibilitychange",
      () => onVisibilityChange(!document.hidden));
    return this;
  }

  #setTime() {
    this.#time = {
      clock: new THREE.Clock(),
      elapsed: 0
    };
    return this;
  }

  /*
   * Dev tool
   */
  #addHelpers() {

    this.gui = new GUI();
    this.configs = {
      envMapIntensity: 1,
      bgmVolume: 0.2,
      effectVolume: 0.8,
    };

    const axesHelper = new THREE.AxesHelper(5);
    axesHelper.setColors(
      new THREE.Color(0xffffff), 
      new THREE.Color(0xffffff), 
      new THREE.Color(0xffffff)
    )
    this.#scene.add(axesHelper);
    const gameAxesHelper = new THREE.AxesHelper(5);
    gameAxesHelper.setColors(
      new THREE.Color(0x0000ff), 
      new THREE.Color(0x0000ff), 
      new THREE.Color(0x0000ff)
    );
    this.#gameScene.add(gameAxesHelper); 


    const sound = this.gui.addFolder("sound");

    sound.add(this.configs, "bgmVolume")
    .min(0)
    .max(1)
      .step(0.001)
      .onChange(volume => {
        this.#bgm.volume = volume;
      })
  
    sound.add(this.configs, "effectVolume")
    .min(0)
    .max(1)
      .step(0.001)
      .onChange(volume => {
        this.#hitSound.volume = volume;
      })

    const color = this.gui.addFolder("color");

    color.addColor(this, "ballColor")
      .onChange(newColor => {
        if (this.#ball.mesh)
          this.#ball.mesh.material.color.set(newColor);
      })

    color.addColor(this, "wallColor")
      .onChange(newColor => {
        Object.entries(this.#walls) 
          .forEach(([id, mesh]) => {
            mesh.material.color.set(newColor);
          })
        
      })

    Object.entries(this.peddleColors).forEach(([player], index) => {
      color.addColor(this.peddleColors, player) 
        .onChange(newColor => {
          this.#peddles[index].mesh.material.color.set(newColor);
        })
    })

    const light = this.gui.addFolder("light");

    light.add(this.configs, "envMapIntensity")
      .min(0)
      .max(3)
      .step(0.001)
      .onChange((intensity) => {
        this.#scene.traverse(child => {
          if (child.isMesh && child.material.isMeshStandardMaterial) {
            child.material.envMapIntensity = intensity;
          }
        })
      })
    light.addColor(this.lightConfigs, "ambientColor")
      .onChange(color => {
        this.#lights.ambientLight.color.set(color);
      })

    light.addColor(this.lightConfigs, "directionalColor")
      .onChange(color => {
        this.#lights.directionalLight.color.set(color);
      })

    light.add(this.lightConfigs, "ambientIntensity")
      .min(0).max(5)
      .step(0.01)
      .onChange(value => this.#lights.ambientLight.intensity = value);
    
    light.add(this.lightConfigs, "directionalIntensity")
      .min(0).max(5)
      .step(0.01)
      .onChange(value => this.#lights.directionalLight.intensity = value);

    const background = this.gui.addFolder("background");
    background.add(this.#scene, "backgroundBlurriness")
      .min(0).max(1).step(0.001);
    background.add(this.#scene, "backgroundIntensity")
      .min(0).max(1).step(0.001);

    return this;
  }

  #addControls() {
    window.addEventListener("keydown", event => {
      const controlKey = controlMap[event.key];
      if (!controlKey)
        return ;
      this.#peddleControls[controlKey.player].pressed = {
        ...controlKey,
        key: event.key
      };
    });

    window.addEventListener("keyup", event => {
      const controlKey = controlMap[event.key];
      if (!controlKey)
        return ;
      if (this.#peddleControls[controlKey.player].pressed.key == 
        event.key) {
        this.#peddleControls[controlKey.player].pressed = {
          x: 0, 
          y: 0,
          key: null,
          player: controlKey.player
        };
      };
    })
    return this;
  }

  #addEvents() {
    const hitSoundEvent = this.#physics.addCollisionCallback(
      (collider, collidee, time) => {
        if (Math.abs(this.#time.elapsed - this.#hitSound.time) < SOUND_EFFECT_THRESHOLD)
          return false;
        if (collider.isShape("CIRCLE") || collidee.isShape("CIRCLE")) {
          return true;
        }
        return false;
      },
      (collider, collidee, time) => {
        this.#hitSound.sound.currentTime = 0;
        this.#hitSound.sound.volume = this.#hitSound.volume;
        this.#hitSound.sound.play();
        this.#hitSound.time = this.#time.elapsed;
      }
    );

    const ballOutEvent = this.#physics.addCollisionCallback(
      (collider, collidee, time) => {

        if (!collider.isShape("CIRCLE") && !collidee.isShape("CIRCLE")) {
          return false;
        }
        return (collidee.data && collidee.data.wallType &&
          collidee.data.wallType == WALL_TYPES.trapWall);
      },
      (collider, collidee, time) => {
        this.#lostSide = collidee.data.direction;
        this.#removeBall()
        .#updateGameData();
        this.isBallMoving = true;
      }
    )

    this.#eventsIds.push(hitSoundEvent);
    this.#eventsIds.push(ballOutEvent);
    return this;
  }

  /**
   * @param {{
   *  frameTime: number,
   *  frameSlice: number
   * }} args
   */
  #updateObjects({frameTime, frameSlice}) {

    this.#peddles.forEach((peddle, index) => {
      const control = this.#peddleControls[index];
      this.#physics.setState(peddle.physicsId,
        (state) => {
          let vel = { ...state.velocity };
          if (control.pressed.x == 0) {
            vel.x = Math.abs(vel.x) < EPSILON ? 0: vel.x * PEDDLE_DECEL_RATIO;
          }
          else if (control.pressed.x > 0) {
            vel.x = Math.min(MAX_PEDDLE_SPEED, vel.x + PEDDLE_ACCEL);
          }
          else {
            vel.x = Math.max(-MAX_PEDDLE_SPEED, vel.x - PEDDLE_ACCEL);
          }
          return { velocity: {
            ...vel
          }};
        })
    })
    while (frameTime > EPSILON) {
      this.#physics.update(frameSlice);
      frameTime -= frameSlice; 
      frameSlice = Math.min(frameTime, FRAME_TIME_THRESHOLD);
    }
    const states = this.#physics.allStates;
    this.#objects.forEach(({mesh, physicsId}) => {
      if (!states[physicsId])
        return ;
      const position = states[physicsId].position;
      mesh.position.set(position.x, position.y, mesh.position.z);
    })
  }

  #removeBall() {
    const mesh = this.#ball.mesh;
    const id = this.#ball.physicsId
    this.#physics.removeCollisionCallback(id);
    this.#physics.removeObject(id);
    this.#gameScene.remove(mesh);
    this.#ball.mesh = null;
    this.#ball.physicsId = null;
    return this;
  }

  #updateGameData() {
    if (!this.#lostSide)
      return ;
    /** @type {GameData} */ //@ts-ignore: casting
    const gameData = this.#gameData;
    /** @type {Player[]} */
    const players = gameData.getPlayers();
    if (this.#lostSide != DIRECTION.top && 
      this.#lostSide != DIRECTION.bottom) {
      throw "invalid side " + this.#lostSide;
    }
    const winSide = this.#lostSide == DIRECTION.top ? DIRECTION.bottom: DIRECTION.top;
    const winPlayer = players[PLAYER_POSITION[winSide]];
    const newScores = {...gameData.scores}
    newScores[winPlayer.nickname] += 1;
    gameData.scores = newScores;
    this.#lostSide = null;
    return this;
  }

  #startRender() {
    const tick = (() => {
      const elapsed = this.#time.clock.getElapsedTime();
      let frameTime = elapsed - this.#time.elapsed;
      this.#time.elapsed = elapsed;
      let frameSlice = Math.min(frameTime, FRAME_TIME_THRESHOLD);
      this.#renderId = window.requestAnimationFrame(tick);
      this.#updateObjects({frameTime, frameSlice})
      //this.#particleGenerator.animate();
      this.#renderer.render(this.#scene, this.#camera);
      this.controls.update();
    }).bind(this);

    tick();
    return this;
  }
}
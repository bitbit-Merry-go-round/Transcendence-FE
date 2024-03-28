import * as THREE from "three";
import Physics from "@/game/physics";
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls'
import { EPSILON } from "@/game/physicsUtils";
import PhysicsEntity from "@/game/physicsEntity";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader";
import { GameData, Player, GAME_TYPE } from "@/data/game_data";
import ParticleGenerator from "@/game/particleGenerator";
import ObservableObject from "@/lib/observable_object";
import GUI from "node_modules/lil-gui/dist/lil-gui.esm.min.js";
import { Animation, AnimationCurves } from "@/game/animation";
import { WALL_TYPES, DIRECTION, GameMap } from "@/data/game_map";
import LeafGenerator from "@/game/leafGenerator";
import ImageGenerator from "@/utils/image_generator";
import UserLabel from "@/views/components/user_label";
import View from "@/lib/view";

export const ASSETS = Object.freeze({
  scene: "assets/models/scene/game_scene.glb",
  leaf: "assets/models/leaf/leaf.gltf",
  board: "assets/models/board/board.glb",
  laurel_wreath: "assets/models/laurel_wreath/scene.gltf",
  bgm: "assets/sound/bgm1.mp3",
  hitSound: "assets/sound/hit.mp3",
  winSound: "assets/sound/win.mp3",
  lostSound: "assets/sound/lost.mp3",
  getColorTexture: (name) => `assets/textures/${name}/diff.jpg`,
});
const FRAME_TIME_THRESHOLD = 0.01;
const MAX_PEDDLE_SPEED = 50;
const PEDDLE_ACCEL = 10;
const PEDDLE_DECEL_RATIO = 0.5;
const SOUND_EFFECT_THRESHOLD = 0.3;
const SAFE_WALL_STUCK_THRESHOLD = 4;

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
  ",": {
    player: 1, 
    x: -1,
    y: 0,
  },
  ".": {
    player: 1, 
    x: 1,
    y: 0,
  },
};

/**
 * Game Scene.
 */
export default class Scene {

  // debug
  #isDebug = false;

  #physics;
  #scene;
  #scene_objs = {};
  /** @type {GameData} */
  #gameData;
  #gameMap;

  /** @type {"TOP" | "BOTTOM" | null} */
  #lostSide = null;

  /** @type {THREE.Group} */
  #gameScene;
  #canvas;
  /** @type {{
   *  width: number
   *  height: number
   * }} */

  /** @type {{
   *  container: THREE.Group,
   *  board: THREE.Object3D,
   *  generator: ImageGenerator
   * }}
   */
  #tournamentBoard = null;
  #windowSize;

  /** @type {THREE.PerspectiveCamera} */
  #camera;
  /** @type {OrbitControls} */
  #controls;

  cameraPositions = { 
    start: { x: 0, y: 70, z: 30 },
    startRotate: { x: 0, y: 20, z: 10 },
    play: { x: 0.2, y: 1.8, z: 0.75 },
  };

  cameraRotations = {
    play: { x: -0.26, y: 0, z: 0}
  };

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
  };

  /**
   *  Object
   */

  /** @type {{
   *   clock: THREE.Clock,
   *   elapsed: number
   * }} */
  #time;

  /** @type {{
   *    mesh: THREE.Mesh,
   *    physicsId: number
   *  }[]}
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
  #ballRadiusInGame = 3;
  #ballSpeed = 40;
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
  #wallTextureRepeat = 0.05;
  
  /** @type {number} */
  wallColor = 0x00ff00;

  #safeWallHitCount = 0;

  /** @type {{
   *    mesh: THREE.Mesh,
   *    physicsId: number
   *  }[]}
   */
  #peddles = [];

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
  peddleColors = {
    "player1": 0x00ffff,
    "player2": 0xffff00,
  };

  peddleSizeInGame = {
    width: 0.15,
    height: 0.015
  };

  /** @type {{
   *  desc: string,
   *  id: number
   * }[]} */
  #eventsIds = [];

  #hitSound = {
    sound: new Audio(ASSETS.hitSound),
    lastPlayed: 0,
    volume: 0.8
  };

  /**
   * Effect
   */

  /** @type {ParticleGenerator} */
  #sceneParticle;

  /** @type {ParticleGenerator} */
  #gameParticle;

  /** @type {LeafGenerator} */
  #leaf;

  /** @type {{
   *    key: string,
   *    animation: Animation,
   *    speed: number,
   *    onProgress: (
   *    current: ({ x: number, y: number, z: number }|
   *    { x: number, y: number } | number)) => void,
   *    onEnded: (last: { x: number, y: number, z: number }) => void
   *  }[]} 
   */
  #animations = [];
  #textureLoader = new THREE.TextureLoader();
  #gltfLoader = new GLTFLoader();

  /** @type {{
   *  [key in string]: {
   *    colorTexture: THREE.Texture,
   *    normalTexture: THREE.Texture,
   *    aoRoughnessMetallnessTexture: THREE.Texture
   *  }
   * }} */
  #loadedTextures = { };

  /** @type {THREE.Object3D} */
  #trophy;

  #gameSize = {
    width: 100,
    height: 100,
    depth: 1
  };

  #depth = {
    wall: 5,
    peddle: 3
  };

  /** @type {{
   *  topLeft:{
   *    generator: ImageGenerator,
   *    mesh: Promise<THREE.Mesh>,
   *    view: UserLabel
   *  },
   *  bottomRight: {
   *    generator: ImageGenerator,
   *    mesh: Promise<THREE.Mesh>,
   *    view: UserLabel
   *  },
   *  label: UserLabel,
   *  size: {
   *    width: number,
   *    height: number
   *  },
   *  texts: {
   *    player1: string[],
   *    player2: string[]
   *  }
   * }}
   */
  #playerLabels;

  #renderId = 0;
  #stuckHandler;

  /**
   * @params {Object} params
   * @param {{
   *  canvas: HTMLCanvasElement,
   *  gameData: ObservableObject,
   *  gameMap: GameMap,
   *  stuckHandler: ((isStuck:boolean) => void) | null
   * }} params
   */
  constructor({canvas, gameData, gameMap, stuckHandler = null}) {
    this.#canvas = canvas;
    //@ts-ignore
    this.#gameData = gameData;
    this.#gameMap = gameMap;
    if (stuckHandler) {
      this.#stuckHandler = /**@param {boolean} isStuck */ (isStuck) => {
        stuckHandler(isStuck);
      }
    }
    else 
      this.#stuckHandler = null;
    this.#scene = new THREE.Scene();
    this.#gameScene = new THREE.Group();
    this.#windowSize = {
      width: canvas.width,
      height: canvas.height
    };
    this.#physics = new Physics();
    this
      .#setSceneBackground()
      .#setPlayerLabels()
      .#load()
      .#init()
      .#setGameBackground()
      .#addObjects()
      .#addEvents()
      .#addHelpers()
      .#addControls()
      .#loadLeaf()
      .#startRender();
  }

  changePlayer(players) {
    if (this.#gameData.gameType == GAME_TYPE.local1on1) {
      throw "Invalid call change player";
    }
    this.#updateLabel({
      player: players[0],
      position: "TopLeft"}
    );
    this.#updateLabel({
      player: players[1],
      position: "BottomRight"}
    );
  }

  startGame() {
    this.#addBall();
    this.isBallMoving = true;
  }

  resetBall() {
    if (this.#ball.mesh) {
      this.#removeBall();
    }
    this.#addBall();
    this.isBallMoving = true;
  }

  endGame() {
    if (this.#ball.mesh)  {
      this.#removeBall();
    }
    const sound = new Audio(
      ASSETS.winSound
    );
    sound.volume = 0.8;
    sound.play();
    this.isBallMoving = false;
    const cameraDest = { ...this.cameraPositions.play };
    cameraDest.z += 0.5;
    this.#showLeaves();
    if (this.#gameData.gameType == GAME_TYPE.localTournament &&
    this.#gameData.tournament.isLastRound) {
      cameraDest.z += 3;
      this.#moveObject({
        target: this.#camera,
        dest: cameraDest,
        speed: 0.005,
        curve: AnimationCurves.easein,
        onEnded: () => {
          this.#gameParticle.remove();
          this.#showTrophy();
        }
      });
    }
    else {
      this.#moveObject({
        target: this.#camera,
        dest: cameraDest,
        speed: 0.01,
        curve: AnimationCurves.easein
    });
    }
  }

  #showLeaves() {
    const container = new THREE.Mesh(
      new THREE.BoxGeometry(),
      new THREE.MeshBasicMaterial({
        transparent: true,
        opacity: 0,
        depthWrite: false
      })
    );
    container.position.z = 0.5;
    this.#scene.add(container);
    this.#leaf.generate({
      count: 50,
      startY: 5,
      endY: -1,
      container
    });
    return this;
  }

  showTournamentBoard(onEnded) {
    const cameraDest = { ...this.cameraPositions.play };
    cameraDest.x -= 1.0;
    cameraDest.z += 1.5;
    this.#moveObject({
      target: this.#camera,
      dest: cameraDest,
      speed: 0.01,
      curve: AnimationCurves.easein,
      onEnded: () => {
        /** @type {THREE.Object3D} */
        const target = this.#tournamentBoard.board;
        const targetPos = new THREE.Vector3();
        target.getWorldPosition(targetPos);
        targetPos.z += 0.5;
        this.#rotateCameraTo({
          targetPos,
          speed: 0.01,
          curve: AnimationCurves.easein,
          onEnded: onEnded
        })
      }
    });
  }

  goToGamePosition(onEnded) {
    this.#moveObject({
      target: this.#camera,
      dest: {...this.cameraPositions.play},
      curve: AnimationCurves.easeout,
      speed: 0.015,
    });
    this.#animateRotation({
      target: this.#camera,
      dest: {...this.cameraRotations.play},
      speed: 0.015,
      onEnded: onEnded
    })
  }

  #showTrophy(onEnded) {
    if (!this.#trophy) {
      console.error("trophy is not loaded");
      return ;
    }
    this.#trophy.position.set(
      this.#camera.position.x,
      this.#camera.position.y + 0.5, 
      this.#camera.position.z - 1.5
    )
    const spotLight = new THREE.SpotLight(new THREE.Color("white"));
    spotLight.intensity = 100;
    spotLight.distance = 5;
    spotLight.angle = Math.PI * 0.1;
    spotLight.position.set(
      this.#trophy.position.x,
      this.#trophy.position.y + 1,
      this.#trophy.position.z
    );
    spotLight.target = this.#trophy;
    this.#trophy.visible = true;
    this.#scene.add(spotLight);
    const dest = new THREE.Vector3().copy(this.#trophy.position);
    dest.y -= 0.5;
    this.#moveObject({
      target: this.#trophy,
      dest,
      speed: 0.01,
      onEnded: () => {
        this.#animateRotation({
          target:this.#trophy,
          speed: 0.001,
          dest: {
            x: this.#trophy.rotation.x,
            y: this.#trophy.rotation.y + Math.PI * 2.0,
            z: this.#trophy.rotation.z
          },
          repeat: true
        });

      }
    });
  }

  updateBoard(content) {
    this.#tournamentBoard.generator.generate(content)
      .then(canvas =>  {
        const texture = new THREE.Texture(canvas);
        texture.needsUpdate = true;
        /** @type {THREE.Mesh} */ //@ts-ignore
        const board = this.#tournamentBoard.board;
        /** @type {THREE.MeshBasicMaterial} */ //@ts-ignore
        const material = board.material;
        material.map = texture
        material.needsUpdate = true;
        return ;
      });
  }

  /** @param {HTMLElement} content */
  createBoard(content) {
    this.#gltfLoader.load(
      ASSETS.board,
      (gltf) => {
        /** @type {THREE.Object3D} */
        let root = gltf.scene;
        while (root.children.length == 1) {
          root = root.children[0];
        }
        const board = root.children.find(
          o => o.name == "Board"
        ); 
        const scene = gltf.scene;
        const width = content.style.width;
        const height = content.style.height;
        const size = {
          width: Number(width.replace("px", "")),
          height: Number(height.replace("px", "")),
        };
        this.#tournamentBoard = {
          container: scene,
          board,
          generator: new ImageGenerator({ size })
        };
        scene.rotation.y = Math.PI * 0.4;
        board.scale.x = -0.8;
        scene.position.set(-2.5, 0, 1);
        board.position.z -= 0.1;
        board.rotation.y = Math.PI;
        this.#scene.add(scene);
        this.#tournamentBoard.generator.generate(content)
          .then(canvas => {
            const texture = new THREE.Texture(canvas);
            texture.needsUpdate = true;
            /** @type {THREE.Mesh} */ //@ts-ignore
            const mesh = board;
            mesh.material = new THREE.MeshBasicMaterial({
              map: texture,
              transparent: true
            });
          })
      },
    )
  }

  #setPlayerLabels() {

    //@ts-ignore
    this.#playerLabels = {};
    const player1Controls = {
      left: Object.keys(controlMap).find(key => 
        controlMap[key].player == 0 && controlMap[key].x == -1
      ),
      right: Object.keys(controlMap).filter(key => 
        controlMap[key].player == 0 && controlMap[key].x == 1
      )
    }
    const player2Controls = {
      left: Object.keys(controlMap).find(key => 
        controlMap[key].player == 1 && controlMap[key].x == -1
      ),
      right: Object.keys(controlMap).filter(key => 
        controlMap[key].player == 1 && controlMap[key].x == 1
      )
    }
    this.#playerLabels.texts = {
      player1: [
        "L: " + player1Controls.left,
        "R: " + player1Controls.right
      ],
      player2: [
        "L: " + player2Controls.left,
        "R: " + player2Controls.right
      ]
    }
    const players = this.#gameData.currentPlayers;
    this.#playerLabels.size = { width: 200, height: 250 };
    //@ts-ignore 
    this.#playerLabels.topLeft = {
      generator :
      new ImageGenerator({
        size: this.#playerLabels.size
      })
    };
    //@ts-ignore 
    this.#playerLabels.bottomRight = {
      generator :
      new ImageGenerator({
        size: this.#playerLabels.size
      })
    };
    this.#playerLabels.topLeft.mesh = this.#createLabel({
      player: players[0],
      position: "TopLeft",
    });
    this.#playerLabels.bottomRight.mesh = this.#createLabel({
      player: players[1],
      position: "BottomRight",
    });
    return this;
  }

  /** @param {{
   *  player: Player,
   *  position: "TopLeft" | "BottomRight"
   * }} params */
  async #updateLabel({ player, position }) {
    const {view, generator, mesh} = position == "TopLeft" ?
      this.#playerLabels.topLeft: 
      this.#playerLabels.bottomRight;
    /** @type {HTMLElement} */
    const name = view.querySelector("#label-user-name");
    name.innerText = player.nickname;
    const canvas = await generator.generate(view);
    mesh.then(mesh => {
      const texture = new THREE.Texture(canvas);
      texture.minFilter = THREE.NearestFilter;
      texture.magFilter = THREE.NearestFilter;
      texture.needsUpdate = true;
        /** @type {THREE.MeshBasicMaterial} */ //@ts-ignore
      const material = mesh.material;
      material.map = texture
      material.needsUpdate = true;
    })
  }

  /** @param {{
   *  player: Player,
   *  position: "TopLeft" | "BottomRight"
   * }} params */
  async #createLabel({player, position}) {
     
    const view = new UserLabel({data: {
      name: player.nickname,
      texts: position == "TopLeft" ? this.#playerLabels.texts.player1: this.#playerLabels.texts.player2
    }});
    await view.render();
    if (position == "TopLeft") {
      this.#playerLabels.topLeft.view = view;
    }
    else {
      this.#playerLabels.bottomRight.view = view;
    }
    //@ts-ignore 
    view.children[0].style.width = this.#playerLabels.size.width + "px";
    //@ts-ignore 
    view.children[0].style.height = this.#playerLabels.size.height+ "px";
    const generator = position == "TopLeft" ? this.#playerLabels.topLeft.generator : this.#playerLabels.bottomRight.generator;
    return generator.generate(view)
      .then(canvas => {
        const texture = new THREE.Texture(canvas);
        texture.minFilter = THREE.NearestFilter;
        texture.magFilter = THREE.NearestFilter;
        texture.needsUpdate = true;
        const plane = new THREE.PlaneGeometry(
          0.3, 
          0.3
        );
        const mesh = new THREE.Mesh(plane, new THREE.MeshBasicMaterial({
          map: texture,
          transparent: true
        }));
        mesh.scale.set(1.5, 1, 1);
        return mesh;
      });
  }

  prepareDisappear() {
    this.#bgm.pause();
    this.#bgm.currentTime = 0;
  }

  #load() {
    /**
     * Scene
     */
    this.#gltfLoader.load(
      ASSETS.scene,
      (gltf) => {
        
        const scene= gltf.scene;
        scene.scale.set(2, 2, 2);
        scene.children.forEach(obj =>  {
          this.#scene_objs[obj.name] = obj;
        });

        /** @type {THREE.Mesh} */
        const keyboard = this.#scene_objs["keyboard"];
        keyboard.scale.x *= -1;
        keyboard.position.z -= 0.1;

        /** @type {THREE.Mesh} */
        const mac = this.#scene_objs["macintosh"];


        /** @type {THREE.Mesh} */
        let screen;
        mac.traverse(obj => {
          if (obj.name == "screen") //@ts-ignore
            screen = obj
        });
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
        this.#gameScene.position.z += 0.1;

        this.#gameScene.scale.set(
          (screenSize.x / sceneSize.x) * 0.7,
          (screenSize.y / sceneSize.y) * 0.65,
          (screenSize.x / sceneSize.x) * 0.8
        );
        const labelContainer = screen.parent;
        this.#playerLabels.topLeft.mesh
          .then(label => {
            label.position.set(-0.6, 1.2, 1.5);
            labelContainer.add(label)}
          );
        this.#playerLabels.bottomRight.mesh
          .then(label => {
            label.position.set(0.5, -0.4, 1.5);
            labelContainer.add(label);
          });
         
        screen.parent.add(this.#gameScene);
        screen.removeFromParent();

        this.#scene.add(scene);
        this.#camera.position.set(
          this.cameraPositions.start.x,
          this.cameraPositions.start.y,
          this.cameraPositions.start.z,
        );
        const screenPos = new THREE.Vector3();
        this.#gameScene.getWorldPosition(screenPos);
        if (this.#isDebug)
          this.#controls.target = screenPos;
        this.#camera.lookAt(0, 0, 0);
        this.#moveObject({
          target: this.#camera,
          dest: {...this.cameraPositions.startRotate},
          speed: 0.008,
          curve: AnimationCurves.easein,
          onEnded: () => {
            this.#sceneParticle.isPlaying = false;
            this.#gameParticle.isPlaying = true;
            this.goToGamePosition(); 
          }
        });
      },
      (progress) => {
      },
      (error) => {
        console.error(error);
      }
    )

    // bgm
    this.#bgm = new Audio(ASSETS.bgm);
    this.#bgm.loop = true;
    this.#bgm.volume = 0.05;
    this.#bgm.play()

    if (this.#gameData.gameType == GAME_TYPE.localTournament) {
      this.#gltfLoader.load(ASSETS.laurel_wreath,
        (gltf) => {
          gltf.scene.scale.set(0.1, 0.1, 0.1);
          gltf.scene.position.set(1, 2, 2);
          this.#trophy = gltf.scene;
          this.#trophy.visible = false;
          this.#scene.add(this.#trophy);
        })
    }

    return this;
  }

  /** @param {{
   *    target: THREE.Object3D,
   *    dest: {
   *      x: number, y: number, z: number
   *    },
   *    speed: number,
   *    curve?: (t: number) => number,
   *    onEnded?: (last:{
   *      x: number, y: number, z: number
   *    }) => void
   * }} params
   */
  #moveObject({target, dest, speed, curve = AnimationCurves.smoothstep, onEnded = () => {}}) {
    const animation = new Animation({
      start: target.position.clone(),
      end: new THREE.Vector3(
        dest.x, 
        dest.y,
        dest.z
      ),
      curve,
      repeat: false,
      key: target.name + "Move"
    })
    this.#animations.push({
      animation,
      speed,
      onProgress: (pos) => { //@ts-ignore 
        target.position.set(pos.x, pos.y, pos.z);
      },
      onEnded,
      key: animation.key
    });
    return (this.#animations[this.#animations.length - 1]);
  }

  /** @param {{
   *    target: THREE.Vector3,
   *    speed: number,
   *    curve?: (t: number) => number,
   *    onEnded?: (last:{
   *      x: number, y: number, z: number
   *    }) => void
   * }} params 
   * */
  #rotateCameraTo({targetPos, speed, 
    curve = AnimationCurves.smoothstep, onEnded = () => {}}) {
    const qCamera = this.#camera.quaternion.clone();
    this.#camera.lookAt(targetPos);
    const dest = this.#camera.quaternion.clone();
    this.#camera.quaternion.copy(qCamera);
    const animation = new Animation({
      start: 0,
      end: 1,
      curve,
      repeat: false,
      key: "cameraRotateTo"
    })
    this.#animations.push({
      animation,
      speed,
      onProgress: (progress) => { //@ts-ignore 
        this.#camera.quaternion.slerp(dest, progress);
      },
      onEnded,
      key: animation.key
    });
    return (this.#animations[this.#animations.length - 1]);
    
  }

  /** @param {{
   *    target: THREE.Object3D,
   *    dest: {
   *      x: number, y: number, z: number
   *    },
   *    speed: number,
   *    curve?: (t: number) => number,
   *    repeat?: boolean,
   *    onEnded?: (last:{
   *      x: number, y: number, z: number
   *    }) => void
   * }} params
   */
  #animateRotation({
    target,
    dest, 
    speed, 
    curve = AnimationCurves.smoothstep, 
    repeat = false,
    onEnded = () => {}}) {
    const animation = new Animation({
      start: new THREE.Vector3().copy(target.rotation),
      end: new THREE.Vector3(
        dest.x,
        dest.y,
        dest.z
      ),
      curve,
      repeat,
      key: target.name + "rotate"
    })
    this.#animations.push({
      animation,
      speed,
      onProgress: (rotation) => { //@ts-ignore 
        target.rotation.set(rotation.x, rotation.y, rotation.z);
      },
      onEnded,
      key: animation.key
    });
    return (this.#animations[this.#animations.length - 1]);
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
      new THREE.SphereGeometry(this.#ballRadiusInGame, 16, 16),
      new THREE.MeshStandardMaterial({
        color: this.ballColor,
        metalness: 0.3,
        roughness: 0.4
      })
    );
    mesh.position.set(0, 0, 0);
    const ballWidth =  this.#ballRadiusInGame;
    const ballHeight = this.#ballRadiusInGame;

    const ballPhysics = PhysicsEntity.createCircle({
      type: "MOVABLE",
      collideType: "DYNAMIC",
      radius: Math.max(ballWidth, ballHeight),
      center: { x: 0, y:0 }
    });
    this.#ballStartDirection.x = (Math.random() > 0.5) ? DIRECTION.left: DIRECTION.right;
    this.#ballStartDirection.y = (this.#lostSide == DIRECTION.top) ? DIRECTION.bottom: DIRECTION.top;
    let velX = (this.#ballStartDirection.x == DIRECTION.right? 1 : -1) * this.#ballSpeed * (Math.random() + 0.5);
    let velY = (this.#ballStartDirection.y == DIRECTION.top? 1 : -1) * this.#ballSpeed;

    ballPhysics.veolocity = {
      x: velX,
      y: velY,
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
    const sizes = this.#gameMap.wallSizes;
    sizes.forEach(size => {
      const walls = this.#gameMap.getWallsBySize(size);
      const entities = this.#addWall(
        size,
        walls.map(wall => ({
          x: (wall.centerX * 0.01 - 0.5) * this.#gameSize.width,
          y: (wall.centerY * 0.01 - 0.5) * this.#gameSize.height,
          z: this.#depth.wall * 0.5,
        })
        )
      );
      for (let i = 0; i < walls.length; ++i) {
        const wall = walls[i];
        entities[i].data = {
          wallType: wall.type,
        };
        if (wall.type == WALL_TYPES.trap) {
          if (wall.centerX == 50)
            entities[i].data.direction = 
              wall.centerY > 50 ? DIRECTION.top: DIRECTION.bottom;
        }
      }
    })
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


    const loadedTextures = this.#loadedTextures[name];
    if (loadedTextures &&
      loadedTextures.colorTexture && 
      loadedTextures.normalTexture &&
      loadedTextures. aoRoughnessMetallnessTexture) {

      const textures = {};
      Object.entries(loadedTextures)
        .forEach(([ key, text ]) => {
          textures[key] = text.clone();
        });
      return new THREE.MeshStandardMaterial({
        map: textures.colorTexture,
        normalMap: textures.normalTexture,
        aoMap: textures.aoRoughnessMetallnessTexture,
        roughnessMap: textures.aoRoughnessMetallnessTexture,
        metalnessMap: textures.aoRoughnessMetallnessTexture,
      });

    }
    //@ts-ignore
    this.#loadedTextures[name] = {};

    const colorTexture = this.#textureLoader.load(
      `assets/textures/${name}/diff.jpg`,
      texture => {
        this.#loadedTextures[name].colorTexture = texture.clone();
        onLoad(texture);
      }
    )

    const normalTexture = this.#textureLoader.load(
      `assets/textures/${name}/nor.png`,
      texture => {
        this.#loadedTextures[name].normalTexture= texture.clone();
        onLoad(texture);
      }
    );

    const aoRoughnessMetallnessTexture = this.#textureLoader.load(
      `assets/textures/${name}/arm.jpg`,
      texture => {
        this.#loadedTextures[name].aoRoughnessMetallnessTexture = texture.clone();
        onLoad(texture);
      }
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
          x: wallSize.width * this.#wallTextureRepeat,
          y: wallSize.height * this.#wallTextureRepeat,
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
        y: this.#gameSize.height * 0.4
      },
      {
        x: 0,
        y: this.#gameSize.height * - 0.4
      },
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

    const physicsEntities = positions.map((pos, index) => {
      const entity = PhysicsEntity.createRect({
        type: "MOVABLE",
        width: size.width,
        height: size.height,
        center: {
          x: pos.x,
          y: pos.y
        }
      });
      entity.data = {
        isPeddle: true,
        player: PLAYER_POSITION[ index == 0 ? DIRECTION.top: DIRECTION.bottom]
      };
      return entity;
    });
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

  #setSceneBackground() {
    this.#scene.background = new THREE.Color("black");
    const container = new THREE.Mesh(
      new THREE.BoxGeometry(),
      new THREE.MeshBasicMaterial({
        transparent: true,
        opacity: 0,
        depthWrite: false
      })
    );
    this.#sceneParticle= new ParticleGenerator({
      textureLoader: this.#textureLoader,
      count: 500,
      particleSize: 0.3,
      computeDepth: true,
      maxSize: {
        x: 2, 
        y: 2,
        z: 2
      },
    });
    this.#sceneParticle.animationConfig.speedCoefficient = 0.0001;
    this.#sceneParticle.animationConfig.speedVariantConstant = 1;
    this.#sceneParticle.setColor(["#ffffff", "#ddd0b2", "#f8edde", "#3ac4d6"]);

    this.#sceneParticle.createParticles();
    const particles = this.#sceneParticle.getParticles();
    container.add(particles);
    container.scale.set(100, 100, 100);
    this.#scene.add(container);

    return this;
  }

  #setGameBackground() {

    const size = {
      x: this.#gameSize.width * 0.8,
      y: this.#gameSize.height * 0.8,
      z: this.#gameSize.depth * 0.5
    };

    const container = new THREE.Mesh(
      new THREE.BoxGeometry(size.x, size.z, size.z),
      new THREE.MeshBasicMaterial({
        transparent: true,
        opacity: 0,
        depthWrite: false
      })
    );
    this.#gameParticle = new ParticleGenerator({
      textureLoader: this.#textureLoader,
      count: 100,
      particleSize: 0.001,
      maxSize: {
        x: 70,
        y: 70,
        z: 20
      }
    });
    this.#gameParticle.isPlaying = false;
    this.#gameParticle.setColor([
      "#008DDA",
      "#41C9E2",
      "#ACE2E1",
      "#F7EEDD",
    ])
    this.#gameParticle.animationConfig.speedCoefficient = 0.001;
    this.#gameParticle.animationConfig.speedVariantCoefficient = 0.001;
    this.#gameParticle.animationConfig.speedVariantConstant = 50;
    this.#gameParticle.createParticles();
    const particles = this.#gameParticle.getParticles();
    container.add(particles);
    container.scale.set(0.8, 0.8, 0.2);
    this.#gameScene.add(container);
    return this;
  }

  #setCamera() {
    this.#camera = new THREE.PerspectiveCamera(
      75,
      this.#windowSize.width / this.#windowSize.height,
      0.1,
      150
    );
    this.#scene.add(this.#camera);
    if (this.#isDebug) {
      this.#controls = new OrbitControls(this.#camera, this.#canvas);
      this.#controls.enableDamping = true;
    }
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
    if (!this.#isDebug)
      return this;
    this.gui = new GUI();
    this.gui.close();
    this.configs = {
      envMapIntensity: 1,
      bgmVolume: 0.05,
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

    const hitSoundEventId = this.#physics.addCollisionCallback(
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

    const hitBallEffectId = this.#physics.addCollisionCallback(
      (collider, collidee, time) => {

        if (!collider.isShape("CIRCLE") && !collidee.isShape("CIRCLE")) {
          return false;
        }
        return (collider.data?.isPeddle || collidee.data?.isPeddle);
      },
      (collider, collidee, time) => {
        if (this.#stuckHandler && this.#safeWallHitCount > SAFE_WALL_STUCK_THRESHOLD) {
          this.#stuckHandler(false);
        }
        this.#safeWallHitCount = 0;
        /** @type {PhysicsEntity} */
        const ball = collider.isShape("CIRCLE") ? collider: collidee;
        /** @type {PhysicsEntity} */
        const peddle = ball == collider ? collidee: collider;
        ball.veolocity.x += peddle.veolocity.x * 0.1;
      }
    )

    const safeWallEventId = this.#physics.addCollisionCallback(
      (collider, collidee, time) => {

        if (!this.#stuckHandler) 
          return false;
        if (!collider.isShape("CIRCLE") && !collidee.isShape("CIRCLE")) {
          return false;
        } 
        return (collidee.data?.wallType == WALL_TYPES.safe) ;
      },
      (collider, collidee, time) => {
        this.#safeWallHitCount += 1;
        if (this.#safeWallHitCount > SAFE_WALL_STUCK_THRESHOLD) {
          this.#stuckHandler(true); 
        }
      }
    )

    const ballOutEventId = this.#physics.addCollisionCallback(
      (collider, collidee, time) => {

        if (!collider.isShape("CIRCLE") && !collidee.isShape("CIRCLE")) {
          return false;
        }
        return (collidee.data && collidee.data.wallType &&
          collidee.data.wallType == WALL_TYPES.trap);
      },
      (collider, collidee, time) => {
        this.#lostSide = collidee.data.direction;
        if (this.#stuckHandler && this.#safeWallHitCount > SAFE_WALL_STUCK_THRESHOLD) {
          this.#stuckHandler(false);
        }
        this.#safeWallHitCount = 0;
        this.#removeBall()
          .#updateGameData();
      }
    )

    this.#eventsIds.push({
      desc: "hitSoundEvent",
      id: hitSoundEventId
    });
    this.#eventsIds.push({
      desc: "ballOutEvent",
      id: ballOutEventId
    });
    this.#eventsIds.push({
      desc: "hitBallEffect",
      id: hitBallEffectId
    });
    this.#eventsIds.push({
      desc: "safeWallEventId",
      id: safeWallEventId
    });
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
    const players = gameData.currentPlayers;
    if (this.#lostSide != DIRECTION.top && 
      this.#lostSide != DIRECTION.bottom) {
      throw "invalid side " + this.#lostSide;
    }
    const winSide = this.#lostSide == DIRECTION.top ? DIRECTION.bottom: DIRECTION.top;
    const winPlayer = players[PLAYER_POSITION[winSide]];
    
    gameData.setScore({
      player: winPlayer, 
      score: gameData.getScore(winPlayer) + 1
    })
    //@ts-ignore
    this.#gameData.valueChanged("scores");
    return this;
  }

  #loadLeaf() {

    this.#leaf = new LeafGenerator({
      loader: this.#gltfLoader,
      path: ASSETS.leaf
    });
    this.#leaf.load();
    return this;
  }

  #startRender() {
    const tick = (() => {
      if (this.#isDebug)
        this.#controls.update()
      const elapsed = this.#time.clock.getElapsedTime();
      let frameTime = elapsed - this.#time.elapsed;
      this.#time.elapsed = elapsed;
      this.#animations.forEach(
        ({animation, speed, onProgress, key, onEnded}) => {
          animation.proceed(speed);
          onProgress(animation.current);
          if (animation.isFinished) {
            onEnded(animation.current);
          }
        })
      this.#animations = this.#animations.filter(e => !e.animation.isFinished);
      let frameSlice = Math.min(frameTime, FRAME_TIME_THRESHOLD);
      this.#renderId = window.requestAnimationFrame(tick);
      this.#updateObjects({frameTime, frameSlice})
      this.#gameParticle.animate();
      this.#sceneParticle.animate();
      this.#leaf.animate();
      this.#renderer.render(this.#scene, this.#camera);
    }).bind(this);

    tick();
    return this;
  }
}

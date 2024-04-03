import { isEmptyObject } from "@/utils/type_util";
import { generateRandomName } from "@/utils/random_name";
import Player from "@/data/player";
import Tournament, * as TM from "@/data/tournament";
import PowerUp, * as PU from "@/data/power_up";

export const GAME_TYPE = Object.freeze({
  local1on1: "LOCAL_1ON1",
  localTournament: "LOCAL_TOURNAMENT",
  remote: "REMOTE"
});

/**
 * GameData.
 */
export default class GameData {

  static createLocalGame() {
    return new GameData({
      players: [
        new Player({ nickname: generateRandomName() }),
        new Player({ nickname: generateRandomName() })
      ],
      type: GAME_TYPE.local1on1
    })
  }

  /** @param {string[]} playerNames */
  static createTournamentGame(playerNames) {
    const players = playerNames.map(
      nickname => new Player({nickname})
    );
    const game = new GameData({ players, type: GAME_TYPE.localTournament });
    game.#_tournament = new Tournament({
      players,
      winScore: game.winScore
    });
    return game;
  }

  /** @type {string} */
  #_gameType;

  get gameType() {
    return this.#_gameType;
  }

  #_winScore = 1;
  get winScore() {
    return this.#_winScore;
  }

  /** @type {{
   *    [key: string] : {
   *      player: number,
   *      type: string,
   *      x?: number,
   *      y?: number,
   *      action?: string
   *    }
   *  }}
   */
  controlMap = {
    "ArrowLeft": {
      player: 0,
      type: "MOVE",
      x: -1,
      y: 0,
    },
    "ArrowRight": {
      player: 0, 
      type: "MOVE",
      x: 1,
      y: 0,
    },
    "ArrowUp": {
      player: 0,
      type: "ACTION",
      action: "USE_POWER_UP"
    },
    ",": {
      player: 1, 
      type: "MOVE",
      x: -1,
      y: 0,
    },
    ".": {
      player: 1, 
      type: "MOVE",
      x: 1,
      y: 0,
    },
    "l": {
      player: 1, 
      type: "ACTION",
      action: "USE_POWER_UP"
    }
  };

  get controls() {
    const player1Controls = {
      left: Object.keys(this.controlMap).find(key => 
        this.controlMap[key].player == 0 &&
        this.controlMap[key].x == -1
      ),
      right: Object.keys(this.controlMap).find(key => 
        this.controlMap[key].player == 0 &&
        this.controlMap[key].x == 1
      ),
      powerUp: Object.keys(this.controlMap).find(key => 
        this.controlMap[key].player == 0 &&
        this.controlMap[key].action == "USE_POWER_UP"
      )
    }
    const player2Controls = {
      left: Object.keys(this.controlMap).find(key => 
        this.controlMap[key].player == 1 &&
        this.controlMap[key].x == -1
      ),
      right: Object.keys(this.controlMap).find(key => 
        this.controlMap[key].player == 1 && 
        this.controlMap[key].x == 1
      ),

      powerUp: Object.keys(this.controlMap).find(key => 
        this.controlMap[key].player == 1 &&
        this.controlMap[key].action == "USE_POWER_UP"
      )
    }
    return [player1Controls, player2Controls];
  }
  /** @type {Player[]} */
  #players = [ ];

  /** @type {{
   *  [key: string]: PU.PowerUpInfo[] 
   * }} */
  #powerUps;

  #_isPowerAvailable;
  get isPowerAvailable() {
    return this.#_isPowerAvailable;
  }

  /** @type {TM.Match} */
  #_currentMatch;

  /** @type {{
   *   [key: string]: number
   * }}
   */
  positions = {};

  /** @type {Tournament | null} */
  #_tournament;

  get tournament() {
    return this.#_tournament;
  }

  get currentMatch() {
    if (this.#_gameType == GAME_TYPE.localTournament) {
      return this.#_tournament.currentMatch;
    }
    return this.#_currentMatch;
  }

  /**
   * @param {{
   *  players: Player[],
   *  positions?: {
   *    [key: string]: number
   *  } 
   *  type: string,
   *  isPowerAvailable?: boolean
   * }} args
   */
  constructor({players, positions = {}, type, isPowerAvailable = true}) {
    this.#players = players;
    if (players.length < 2) {
      throw "Not enough players";
    }
    this.#powerUps = {};
    this.#_isPowerAvailable = true;
    players.forEach(
      p => this.#powerUps[p.nickname] = []);
    this.#_gameType = type; 
    if (isEmptyObject(positions)) 
      this.setPositions(players);
    else 
      this.positions = positions;

    if (type == GAME_TYPE.local1on1) {
      this.#setCurrentMatch();
    }
  }

  /** @param {Player[]} players */
  setPositions(players) {
    players.forEach((p, i) => {
      this.positions[p.nickname] = i;
    })
  }

  /** @param {{
   *  player: Player, 
   *  score: number
   *  }} params
   */
  setScore({player, score}) {
    const currentMatch = this.currentMatch;
    if (currentMatch.playerA.name != player.nickname &&
      currentMatch.playerB.name != player.nickname) {
      throw "player to set score is not playing now";
    }
    switch (this.#_gameType) {
      case GAME_TYPE.local1on1:
        if (this.#_currentMatch.playerA.name == player.nickname) {
          this.#_currentMatch.playerA.score = score;
        }
        else {
          this.#_currentMatch.playerB.score = score;
        }
        break;

      case GAME_TYPE.localTournament:
        this.#_tournament.setScore({ player, score });
        break;
      default:
        console.error("not implemented");
        break;
    }
    //@ts-ignore
    if (this._proxy) { //@ts-ignore
      this._proxy.valueChanged("scores");
    }
  }

  /**
   * @param {Player} player
   * @returns {number}
   */
  getScore(player) {
    const match = this.currentMatch;
    if (player.nickname == match.playerA.name)
      return Number(match.playerA.score) ?? 0;
    else if (player.nickname == match.playerB.name)
      return Number(match.playerB.score) ?? 0;
    else 
      throw "player to get score is not playing now";
  }

  get scores() {
    const match = this.currentMatch;
    const scores = {
      [match.playerA.name]: match.playerA.score,
      [match.playerB.name]: match.playerB.score
    };
    return scores;
  }

  get currentPlayers() {
    if (this.#_gameType == GAME_TYPE.local1on1)
      return [...this.#players];
    else if(this.#_gameType == GAME_TYPE.localTournament) {
      return this.#_tournament.currentPlayers;
    }
  }

  /** @param {Player} player */ 
  getPowerUps(player) {
    return [...this.#powerUps[player.nickname]];
  }

  /** @param {Player} player */ 
  getPowerUpCountFor(player) {
    return this.#powerUps[player.nickname].length;
  }

  /** @param {{
   *  player: Player,
   *  powerUp: PU.PowerUpInfo
   * }} params*/ 
  givePowerUpTo({player, powerUp}) {
    const allPowerUps = {...this.#powerUps};
    allPowerUps[player.nickname].push(powerUp);
    this.#powerUps = allPowerUps;
    //@ts-ignore
    if (this._proxy) { //@ts-ignore
      this._proxy.valueChanged("powerUps");
    }
  }

  /** @param {Player} player */ 
  usePowerUp(player) {
    const playerPowerUps = this.#powerUps[player.nickname];
    const powerUp = playerPowerUps.shift();
    //@ts-ignore
    if (this._proxy) { //@ts-ignore
      this._proxy.valueChanged("powerUps");
    }
    return powerUp;
  }

  #setCurrentMatch() {
    const playerA = Object.keys(this.positions).find(name => this.positions[name] == 0);
    const playerB = Object.keys(this.positions).find(name => this.positions[name] == 1);

    this.#_currentMatch = {
      playerA: {
        name: playerA,
        score: 0,
        class: ""
      },
      playerB: {
        name: playerB,
        score: 0,
        class: ""
      }
    }
  }
}


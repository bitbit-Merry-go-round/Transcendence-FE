import { isEmptyObject } from "@/utils/typeutils";
import { generateRandomName } from "@/utils/random_name";
import PowerUp from "@/data/power_up";

/**
 * @typedef {Object} GameResult
 * @property {Player[]} players
 * @property {{
 *   [key: string]: number
 * }} scores
 */

/** @typedef {Object} Match 
 *  @property {{
 *    name: string,
 *    score: number | "",
 *    class: string
 *  }} playerA
 *  @property {{
 *    name: string,
 *    score: number | "",
 *    class: string
 *  }} playerB
*/

export const GAME_TYPE = Object.freeze({
  local1on1: "LOCAL_1ON1",
  localTournament: "LOCAL_TOURNAMENT",
  remote: "REMOTE"
});

/** Tournament. */
export class Tournament {

  /** @param {string[]} names */
  static hasDuplicatedName(names) {
    /** @type {Set<string>} */
    const nameSet = new Set();
    for (let name of names) {
      if (nameSet.has(name))
        return true;
      else 
        nameSet.add(name);
    }
    return false;
  }

  /** @type {number} */
  #_currentMatchIndex;

  /** @type {number} */
  #_winScore;

  /** @type {{
   *    numberOfPlayers: number,
   *    matches: Match[]
   * }} */
  #_currentRound;

  #_allRounds;

  get allRounds() {
    return this.#_allRounds;
  }

  /** @type {Player[]} */
  #allPlayers;

  /** @returns {Match} */
  get currentMatch() {
    return {...this.#_currentRound.matches[this.#_currentMatchIndex]};
  }

  /** @param {{
   *  player: Player, 
   *  score: number
   *  }} params
   */
  setScore({player, score}) {
    const match = this.#_currentRound.matches[this.#_currentMatchIndex];
    if (match.playerA.name == player.nickname) 
      match.playerA.score = score;
    else if (match.playerB.name == player.nickname) 
      match.playerB.score = score;
  }

  get currentPlayers() {
    const playerNames = [this.currentMatch.playerA.name, this.currentMatch.playerB.name];
    return playerNames.map(name => this.#allPlayers.find(p => p.nickname == name));
  }

  /** @returns {{
   *    numberOfPlayers: number,
   *    matches: Match[]
   * }} */
  get currentRound() {
    return {...this.#_currentRound};
  }

  goToNextMatch() {
    if (!this.isCurrentMatchFinished)
      throw ("current match is not finished");

    if (this.#_currentMatchIndex + 1 < this.#_currentRound.matches.length) 
      this.#_currentMatchIndex += 1;
    else if (this.isLastRound)
      console.error ("tournament is finished");
    else {
      this.#goToNextRound();
      this.#_currentMatchIndex = 0;
    }
    this.#_currentRound.matches[this.#_currentMatchIndex].playerA.score = 0;
    this.#_currentRound.matches[this.#_currentMatchIndex].playerB.score = 0;
  }

  get isCurrentMatchFinished() {
    const match = this.currentMatch;
    return (match.playerA.score >= this.#_winScore ||
      match.playerB.score >= this.#_winScore);
  }

  get isLastRound() {
    return this.currentRound.numberOfPlayers == 2;
  }

  get winnerByDefault() {
    if (this.currentMatch.playerB.name == "")
      return this.currentMatch.playerA;
    else if(this.currentMatch.playerA.name == "") 
      return this.currentMatch.playerB;

    return null;
  }

  #goToNextRound() {
    const nameOfWinners = this.currentRound.matches.reduce(
      /** @param {string[]} arr
       * @param {Match} match */
    (names, match) => {
      if (match.playerA.score > match.playerB.score)
        names.add(match.playerA.name);
      else 
        names.add(match.playerB.name);
      return names;
    }, new Set);

    const newRound= this.#createRound(
      this.#allPlayers.filter(
        player => nameOfWinners.has(player.nickname)
      )
    );
    this.#_allRounds.push(newRound);
    this.#_currentRound = newRound;
  }

  /**
   * constructor.
   * @param {{
   *  players: Player[],
   *  winScore: number
   * }} params
   */
  constructor({ players, winScore }) {
    this.#allPlayers = players;
    this.#_winScore = winScore;
    this.#_currentRound = this.#createRound(players);
    this.#_currentMatchIndex = 0;
    this.#_allRounds = [this.#_currentRound];
    this.#_currentRound.matches[this.#_currentMatchIndex].playerA.score = 0;
    this.#_currentRound.matches[this.#_currentMatchIndex].playerB.score = 0;
  }

  /** @param { Player[] } players */
  #createRound(players) {
    let numberOfPlayers = players.length;
    while (numberOfPlayers % 2 != 0)
      numberOfPlayers++;
    const playerIndices = [...Array(players.length).keys()];
    const round = {
      numberOfPlayers,
      matches: []
    }
    playerIndices.sort(() => Math.random() - 0.5);
    while (numberOfPlayers > 0) {
      const playerA = playerIndices.length > 0 ? players[playerIndices.pop()]: null;
      const playerB = playerIndices.length > 0 ? players[playerIndices.pop()]: null;
      round.matches.push({
        playerA: {
          name: playerA?.nickname ?? "",
          score: "",
          class: "",
        },
        playerB: {
          name: playerB?.nickname ?? "",
          score: "",
          class: ""
        }
      })
      numberOfPlayers -= 2;
    }
    return round;
  }
}

/**
 * Player.
 */
export class Player {

  /** @type {string} */
  nickname;

  /** @type {GameResult[]} */
  records = [];

  #_powerUps = [];

  get powerUps() {
    return [...this.#_powerUps];
  }
  
  get numberOfPowerUps() {
    return this.#_powerUps.length;
  }

  getPowerUp(powerUp) {
    this.#_powerUps.push(powerUp);  
  }

  usePowerUp() {
    return this.#_powerUps.shift();
  }

  /** @params {string} nickname */
  constructor({nickname}) {
    this.nickname = nickname;
  }
}

/**
 * GameData.
 */
export class GameData {

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

  /** @type {Player[]} */
  #players = [ ];

  /** @type {Match} */
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
   *  type: string
   * }} args
   */
  constructor({players, positions = {}, type}) {
    this.#players = players;
    if (players.length < 2) {
      throw "Not enough players";
    }
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
  }

  /**
   * @param {Player} player
   */
  getScore(player) {
    const match = this.currentMatch;
    if (player.nickname == match.playerA.name)
      return match.playerA.score;
    else if (player.nickname == match.playerB.name)
      return match.playerB.score;
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


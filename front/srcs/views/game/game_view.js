import View from "@/lib/view";
import Scene from "@/game/game_scene";
import { GameData, GAME_TYPE, Player } from "@/data/game_data";
import ObservableObject from "@/lib/observable_object";
import { GameMap, WALL_TYPES } from "@/data/game_map";
import TournamentPanel from "@/views/components/tournament_panel";

export default class GameView extends View {

  /** @type {HTMLCanvasElement} */
  #canvas;
  /** @type {Scene} */
  #scene;
  /** @type {ObservableObject} */
  #data;
  /** @type {GameData} */
  #gameData;
  #isPaused = true;
  /** @type {HTMLButtonElement} */
  #startButton;
  /** @type {HTMLButtonElement} */
  #resetButton;
  /** @type {HTMLButtonElement} */
  #tournamentButton;
  /** @type {HTMLButtonElement} */
  #returnGameButton;
  /** @type{GameMap} */
  #gameMap;
  /** @type {TournamentPanel} */
  #tournamentPanel;
  /** @type {boolean} */
  #isReadyToPlay = false;

  constructor({data}) {
    super({data: data.gameData});
    this.#data = data.gameData;
    //@ts-ignore
    this.#gameData = data.gameData;
    this.#data.subscribe("scores", 
      (/**@type {{ [key: string]: number }} */ newScores) =>
      this.#onScoreUpdate(newScores));
    this.#gameMap = new GameMap({
      safeWalls: [],
      trapWalls: [],
    });
    this.#gameMap.addBorderWalls();
    this.#gameMap.addWalls([
      {
        width: 40,
        height: 2,
        centerX: 20,
        centerY: 30
      },
      {
        width: 40,
        height: 2,
        centerX: 80,
        centerY: 70
      }
    ], WALL_TYPES.safe);
  }

  connectedCallback() {
    super.connectedCallback();
    this.#createScene()
    .#initButtons()
    .#initEvents();
    /** @type {GameData} */ //@ts-ignore
    if (this.#gameData.gameType == GAME_TYPE.localTournament) {
      this.#initTournament();
    }
  }

  #createScene() {
    this.#canvas = this.querySelector("#game-canvas")
    const container = this.#canvas.parentElement;
    this.#canvas.width = container.offsetWidth
    this.#canvas.height = container.offsetHeight;
    this.#scene = new Scene({
      canvas: this.#canvas,
      gameData: this.#data,
      gameMap: this.#gameMap,
      stuckHandler: (isStuck) => {
        this.#resetButton.style.visibility = isStuck ? "visible": "hidden";
        this.#resetButton.disabled = !isStuck;
      }
    });
    return this;    
  }

  #initButtons() {
    this.#initStartButton()
    .#initResetButton()
    .#initTournamentButton()
    .#initReturnGameButton(); 
    return this;
  }

  #initStartButton() {
    this.#startButton = this.querySelector("#start-button");
    setTimeout(() => {
      this.#startButton.style.visibility = "visible";  
      this.#isReadyToPlay = true;
    }, 4000);

    this.#startButton
      .addEventListener("click", () => {
        if (!this.#isReadyToPlay)
          return ;

        if (this.#isPaused) {
          this.#scene.startGame();
          this.#isPaused = false;
          this.#startButton.style.visibility = "hidden";
        }
      });
    return this;
  }

  #initResetButton() {
    this.#resetButton = this.querySelector("#reset-button");
    this.#resetButton.addEventListener("click", () => {
      this.#scene.resetBall();
      this.#resetButton.style.visibility = "hidden";
      this.#resetButton.disabled = true;
    });
    return this;
  }

  #initTournamentButton() {
    this.#tournamentButton = this.querySelector("#tournament-button");
    this.#tournamentButton.disabled = true;
    if (this.#gameData.gameType != GAME_TYPE.localTournament) {

      this.#tournamentButton.style.visibility = "hidden";
      return ;
    }
    this.#tournamentButton.style.opacity = 0.3;
    this.#tournamentButton.addEventListener("click",
      () => {
        this.#startButton.style.visibility = "hidden";
        this.#tournamentButton.style.opacity = 0.3; 
        this.#isReadyToPlay = false;

        this.#scene.showTournamentBoard(() => {
          this.#returnGameButton.style.visibility = "visible";
          this.#returnGameButton.style.opacity = 1;
          this.#returnGameButton.disabled = false;
          this.#tournamentButton.disabled = true;
        });
      })
    return this;
  }

  #initReturnGameButton() {

    this.#returnGameButton = this.querySelector("#return-game-button");
    this.#returnGameButton.style.visibility = "hidden";
    this.#returnGameButton.disabled = true;
    this.#returnGameButton.addEventListener("click", 
      () => {
        this.#returnGameButton.style.visibility = "hidden";
        this.#scene.goToGamePosition(this.#returnToGame.bind(this));
      }
    );
    return this;
  }

  #initEvents() {
    window.addEventListener("keypress", event => {
      if (event.key == "Enter" && this.#isPaused) {
        if (!this.#isReadyToPlay)
          return ;
        this.#scene.startGame();
        this.#isPaused = false;
        this.#startButton.style.visibility = "hidden";
      }
    }) 

    return this;
  }

  #initTournament() {
    this.#showTournamentBoard();
    return this; 
  }

  #showNextMatch() {
    /** @type {GameData} */ //@ts-ignore
    const nextPlayers = this.#gameData.currentPlayers;
    /** @type {NodeListOf<HTMLSpanElement>}*/
    const labels = this.querySelectorAll(".player-nickname");
    labels[0].innerText = nextPlayers[0].nickname;
    labels[1].innerText = nextPlayers[1].nickname;
    /** @type {NodeListOf<HTMLSpanElement>}*/
    const scoresLabels = this.querySelectorAll(".score-placeholder");
    scoresLabels[0].innerText = "0";
    scoresLabels[0].dataset["player"] = nextPlayers[0].nickname;
    scoresLabels[1].innerText = "0";
    scoresLabels[1].dataset["player"] = nextPlayers[1].nickname;

    this.#scene.changePlayer(this.#gameData.currentPlayers);
  }

  async #showTournamentBoard() {
    const panel = new TournamentPanel({
      data:this.#data,
      onUpdated : () => this.#updatedTournamentBoard(panel)
    });

    panel.defaultBoardStyle = {
      display: "block",
      width:  "1200px",
      height: "800px",
    };
    await panel.render();
    this.#tournamentPanel = panel;
    /** @type {HTMLElement} */ //@ts-ignore
    const board = panel.children[0];
    this.#scene.createBoard(board);
  }

  disconnectedCallback() {
    this.#scene.prepareDisappear();
    super.disconnectedCallback();
  }

  async #updatedTournamentBoard(panel) {
    /** @type {HTMLElement} */ //@ts-ignore
    const board = panel.children[0];
    this.#scene.updateBoard(board);
  }

  /** @param {{ [key: string]: number }} newScores) */
  #onScoreUpdate(newScores) {
    console.log("on score update");
    /** @type {GameData} */
    for (let player of this.#gameData.currentPlayers) {
      const score = newScores[player.nickname];
      /** @type {HTMLSpanElement} */
      const label = this.querySelector(
        `span[data-player=${player.nickname}]`);
      label.innerText = score.toString();
      if (score == this.#gameData.winScore) {
        this.#scene.endGame();
        switch (this.#gameData.gameType) {
          case GAME_TYPE.local1on1:
            // TODO: go to next view
            return;
          case GAME_TYPE.localTournament:
            const tournament = this.#gameData.tournament;
            if (tournament.isLastRound) {
              return ;
            }
            tournament.goToNextMatch(); 
            this.#tournamentButton.disabled = false;
            this.#tournamentButton.style.opacity = 1;
            this.#startButton.disabled = true;
            this.#startButton.style.visibility = "hidden";
            this.#isReadyToPlay = false;
        }
      }
    }
    this.#isPaused = true;
    if (this.#isReadyToPlay) {
      this.#startButton.style.visibility = "visible";
    }
  }

  #returnToGame() {
    this.#isReadyToPlay = true;
    this.#returnGameButton.style.visibility = "hidden";
    this.#startButton.style.visibility = "visible";
    this.#startButton.disabled = false;
    this.#showNextMatch();
  }
}

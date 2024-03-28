import View from "@/lib/view";
import HomeView from "@/views/home/home_view";
import globalData from "@/data/global";
import { routes } from "@/views/config";

/** @typedef {Object} Page 
 *  @property {string} path
 *  @property {View} view
 *  @property {boolean} hasNavbar
 */

export const NAVIGATE_DRIRECTION = Object.freeze({
  forward: "FORWARD",
  backward: "BACKWOARD"
})

class Router {

  static _shared;
  static get transitionDistX() {
    return 30;
  }
  static get transitionOpacity() {
    return 0.7;
  }

  /** @type {{
   * prev: Page | null,
   * current: Page | null,
   * next: Page | null,
   * }} */
  #pages = {
    prev: null,
    current: null,
    next: null
  };

  static get shared() {
    if (!this._shared) {
      return new Router();
    }
    return this._shared;
  }

  constructor() {
    if (Router._shared) 
      return Router._shared
    Router._shared = this;
  }

  /** @param {new ({}) => View} view
   *  @param {string} requestedDirection
   */
  async navigate(view, requestedDirection) {
    let direction = requestedDirection;
    const currentPath = this.#pages.current?.path;
    const destPath = window.location.pathname;
    if (currentPath) {
      if (currentPath == "/" && destPath == "/login") {
        direction = NAVIGATE_DRIRECTION.backward;
      }
      else if (destPath == "/") {
        direction = currentPath== "/login" ? NAVIGATE_DRIRECTION.forward: NAVIGATE_DRIRECTION.backward;
      } 
    }

    const page = new view({
      data: {
        ...globalData
      }
    });
    await page.render();
    if (!this.#pages.current) {
      await this.#setCurrentPage({page, path: destPath});
    }
    else if (direction == NAVIGATE_DRIRECTION.forward ||
      direction == NAVIGATE_DRIRECTION.backward) {
      await this.#runHorizontalNavigation({
        page,
        direction,
        path: destPath
      });
    }
    anchorToLink(page);
  }

  /** @params {{
   *  page: View,
   *  path: string
   * }} params*/
  async #setCurrentPage({page, path}) {

    const app = document.getElementById("app");
    await page.render();
    this.#pages.current = {  
      path,
      view: page,
      hasNavbar: Boolean(page.querySelector("nav-bar"))
    };
    app.innerHTML = "";
    app.appendChild(page);
  }

  async #runHorizontalNavigation({page, direction, path}) {

    this.#pages.prev = this.#pages.current; 
    this.#pages.current = {
      view: page,
      path,
      hasNavbar: Boolean(page.querySelector("nav-bar"))
    };
    const outgoingAnimation = {
      keyframe:      this.#getHorizontalKeyframe({
        direction,
        isIn: false
      }),
      option: {
        duration: 300,
        easing: "cubic-bezier(0, 0.7, 0.9, 1)"
      }
    };
    const incomingAnimation = {
      keyframe: this.#getHorizontalKeyframe({
        direction,
        isIn: true
      }),
      option: {
        duration: 500,
        easing: "ease-in",
      }
    };

    let prevAnimations = null;
    let nextAnimations = null;
    const nextPage = document.createElement("div");
    const prevPage = document.getElementById("app");
    const navbarPreserved = this.#pages.prev.hasNavbar && 
      this.#pages.current.hasNavbar;
    const prevContent = navbarPreserved ? this.#getContent(this.#pages.prev.view): null;
    const nextContent = navbarPreserved ? this.#getContent(this.#pages.current.view): null;
    if (navbarPreserved && prevContent && nextContent) {
      const prevNavbar = prevPage.querySelector("nav-bar");
      prevNavbar.remove();
      prevContent.animate(
        outgoingAnimation.keyframe,
        outgoingAnimation.option
      );
      nextContent.animate(
        incomingAnimation.keyframe,
        incomingAnimation.option
      );
      prevAnimations = prevContent.getAnimations();
      nextAnimations = nextContent.getAnimations();
      }
    else {
      nextPage.animate(
        incomingAnimation.keyframe,
        incomingAnimation.option
      );

      /** @type {HTMLElement} */
      prevPage.animate(outgoingAnimation.keyframe, outgoingAnimation.option);
      prevAnimations = prevPage.getAnimations();
      nextAnimations = nextPage.getAnimations();
    }
    nextPage.classList.add("page");
    nextPage.appendChild(page);
    document.body.appendChild(nextPage);
    Promise.all(prevAnimations
      .map(animation => animation.finished))
      .then(() => {
          prevPage.remove();
      })
    Promise.all(nextAnimations
      .map(animation => animation.finished))
      .then(() => {
        nextPage.id = "app";
      })
    }
  /** @param {View} page */
  #getContent(page) {
    let root = page.children[0];
    while (root.children.length == 1) {
      root = page.children[0]
    }
    if (root) {
      const content = Boolean(root.children[0].querySelector("nav-bar")) ? root.children[1]: root.children[1];
      return content;
    }
    return null;
  }

  /** @param {{
   *    direction: string,
   *    isIn: boolean
   * }} params
   */
  #getHorizontalKeyframe({direction, isIn}) {
    const isForward = direction == NAVIGATE_DRIRECTION.forward;
    let translateX = { from: 0, to: 0 };
    if (isForward) {
      translateX = {
        from: isIn ? 50: 0,
        to: isIn ? 0: -50
      };
    }
    else {
      translateX = {
        from: isIn ? -50: 0,
        to: isIn ? 0: 50
      };
    }
    return  (
      [
        {
          opacity: isIn ? 1 - Router.transitionOpacity: 1,
          transform: `translateX(${translateX.from}%)`
        },
        {
          opacity: isIn ? 1: 1 - Router.transitionOpacity,
          transform: `translateX(${translateX.to}%)`
        }
      ]
    )
  }
}


export async function route({
  direction = NAVIGATE_DRIRECTION.forward
}) {
  const match = routes.find((route) => {
    return route.path == location.pathname
  })
  const view = match ? match.view : HomeView;   
  await Router.shared.navigate(view, direction);
}

/** @param {string | URL} url */
function navigate(url) {
  if (typeof url === "string") {
    const path = new URL(url).pathname;
    if (window.location.pathname == path) {
      return;
    }
    history.pushState(null, null, url);
    route({
      direction: NAVIGATE_DRIRECTION.forward
    });
  }
}

/** @param {HTMLElement | Document | View} parent */
export function anchorToLink(parent) {

  /** @type {HTMLAnchorElement[]} */
  const links = Array.from(parent.querySelectorAll("a[data-link]"));
  links.forEach((link) => {
    link.addEventListener("click", (e) => {
      e.preventDefault();
      navigate(link.href);
    })
  })
}
 

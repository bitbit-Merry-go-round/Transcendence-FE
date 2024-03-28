//@ts-nocheck
import { getValue, setValue, testValue } from "@/utils/keypath";

const COMPONENT_KEY = 'data-component';
const LOOP_KEY = 'data-for';
const CONDITION_KEY = 'data-condition';

/**
 * Base class for page or component
 * @extends {HTMLElement}
 */
export default class View extends HTMLElement {
  static DEFAULT_DIR = "";
  static template = null;
  static allViews = {
    constructor: {},
    dirName: {},
    fileName: {}
  };
  static regexReplace =  /{{([^}}]+)}}/;
  static regexMatch =  /{{([^}}]+)}}/;
  isDisconnected = false;

  /** @type {{
   *  [key in string]: Promise[]
   * }} */
  static waitingComponents = {};

  static async getTemplate() {
    const res = await fetch(this.dirName + this.fileName);
    const text = await res.text(); 
    this.template = text.trim().replace(/>\s+</g, "><");
  }

  /** @params {{
   *  viewName: string,
   *  fileName: string,
   *  dirName: string
   * }} */
  static register({viewName, fileName, dirName }) {
    customElements.define(
      viewName,  
      this.prototype.constructor);
    const className = this.prototype.constructor.name;
    View.allViews.constructor[className] = this.prototype.constructor
    View.allViews.fileName[className] = fileName;
    View.allViews.dirName[className] = dirName;
  }

  static get dirName() {
    return View.allViews.dirName[this.name]
  }

  static get fileName() {
    return View.allViews.fileName[this.name]
  }

  /** @type{any} */
  data;

  /** @type {{[key: string]: Array<
   * {
   *  nodeRef: WeakRef<HTMLElement>,
   *  template: string
   * }
   * >}} */
  #reRenderTriggers = {};

  waitingComponents = [];

  /** @param {any} data */
  constructor({data} = {}) {
    super();
    this.data = data;
    if (data) {
      Object.keys(data).forEach(key => this.#reRenderTriggers[key] = []);
    }
    this.isReady = new Promise(resolve => this.isReadyResolve = resolve);
  }

  get waitReady() {
    return this.isReady;
  }

  async render() {
    if (!this.constructor.template) {
      await this.constructor.getTemplate();
    }
    //View.waitingComponents[this.constructor.name] = [];

    /** @type {HTMLElement} node */
    this.innerHTML = this.constructor.template;
    (await this.renderComponents())
      .#addTriggers()
      .#replaceAttributes()
      .#expandForLoops(this)
      .#filterCondition(this, this.data)
      .#fillData(this);
    this.didRendered();
  }

  reRender() {
    for (let key in this.#reRenderTriggers) {
      this.#reRenderTriggers[key].forEach (({nodeRef, template}) => {

        const node = nodeRef.deref();
        if (node) {
          node.innerHTML = template;
          this.#fillData(node);
        }
      })
    }
  }

  async renderComponents() {

    const elements = this.querySelectorAll(`[${COMPONENT_KEY}]`);
    for (let i = elements.length - 1; i >= 0; i--) {
      const className = elements[i].getAttribute(COMPONENT_KEY);
      /** @type{View} */ 
      const viewClass = View.allViews.constructor[className];
      const view =  await new viewClass({
        data: this.data,
      });
      /** @type {HTMLElement} */
      const html = view;
      html.dataset["parent"] = this.constructor.name;
      await view.render();
      /*
      if (!View.waitingComponents[this.constructor.name][className]) {
        View.waitingComponents[this.constructor.name][className] = [];
      }
      new Promise(resolve => {
        View.waitingComponents[this.constructor.name][className].push(
          {
            resolver: resolve,
            isResolved: false
          }
        );
      })
      */
      elements[i].replaceWith(view);
    }
    return this;
  }

  #addTriggers() {
    for (let i = 0; i < this.children.length; i++) {
      const child = this.children[i];
      if (!(child instanceof HTMLElement))
        continue;
      let matches = View.regexMatch.exec(child.innerHTML);
      if (matches)  {
        const key = matches[1].split('.')[0];
        if (!this.#reRenderTriggers[key]) {
          console.log("Fail to add rerender trigget for ", this, key);
          continue;
        }
        this.#reRenderTriggers[key].push({
          nodeRef: new WeakRef(child),
          template: child.innerHTML,
        })
      }
    }
    return this;
  }

  /** @param {HTMLElement} node */
  #replaceAttributes() {
    const attrs = this.attributes;
    for (let i = 0; i < attrs.length; i++) {
      const attr = attrs[i];
      if (attr.value.length == 0) 
        continue;
      attrs[i].value = this.#replaceContent(
        attr.value, this.data);
    }
    return this;
  }

  #expandForLoops(root) {
    const elements = this.querySelectorAll(`[${LOOP_KEY}]`);

    for (let i = 0; i < elements.length; i++) {
      this.#expandForLoop(elements[i]);
    }
    return root;
  }

  #expandForLoop(node, additionalData = null) {
    const keys = node.getAttribute(LOOP_KEY).split("in")
      .map(key => key.trim());

    if (keys.length < 2)  {
      console.err("Not valid for loop use 'A in B'", node);
      return;
    }
    const container = additionalData? {
      ...this.data,
      ...additionalData
    }: this.data;    
    let values = getValue(container, keys[1]);
    if (!values || !Array.isArray(values)) {
      console.error(`Data for ${keys[1]} is not array  is it inner loop?`, 
        values
      );
      return ;
    }

    const template = node.innerHTML;
    node.innerHTML = "";
    values.forEach(elem => {
      container[keys[0]] = elem;
      node.innerHTML += this.#replaceContent(template, 
        container );
      this.#filterCondition(node, container);


      const innerElements = [...node.children].filter(
        elem => {
          if (elem.hasAttribute(LOOP_KEY))
            return true;
          if (elem.children.length == 0) {
            return false;
          }
          if ([...elem.children].find(c => c.hasAttribute(LOOP_KEY))) {
            return true; 
          }
        });
      if (innerElements.length > 0) {
        for (let i = 0; i < innerElements.length; i++) {
          const innerRoot = innerElements[i].hasAttribute(LOOP_KEY) ? innerElements[i]: [...innerElements[i].children].find(c => c.hasAttribute(LOOP_KEY));
          const innerKeys = innerRoot.getAttribute(LOOP_KEY).split("in")
            .map(key => key.trim());

          if (innerKeys.length < 2)  {
            console.err("Not valid for loop use 'A in B'", node);
            return;
          }
          const innerValues = getValue(elem, innerKeys[1]);
          this.#expandForLoop(innerRoot, 
            {
              [innerKeys[1]]: innerValues
            }
          );
        }
      }
    })
    node.removeAttribute(LOOP_KEY);
  }

    /** @param {HTMLElement} node
     *  @param {Object} container */
  #filterCondition(node, container) {

    const elements = this.querySelectorAll(`[${CONDITION_KEY}]`);
    for (let i = 0; i < elements.length; i++) {
      const key = elements[i].getAttribute(CONDITION_KEY);
      const elem = elements[i];
      if (!testValue(container, key)) {
        if (elem.parentNode) 
          elem.parentNode.removeChild(elem);
        else
          elem.innerHTML = "";
      }
      else {
        elem.removeAttribute(CONDITION_KEY);
      }
    }

    return node;
  }

  #fillData(node) {
    for (let i = 0; i < node.children.length; i++) {
      const child = node.children[i];
      if (!(child instanceof HTMLElement))
        continue;
      this.#replaceAttributes(child);
      child.innerHTML = this.#replaceContent(
        child.innerHTML, this.data); 
      if (child.hasAttribute(COMPONENT_KEY)) {
        continue;
      }
    }
    return this;
  }

  /** @param {string} content
   *  @param {any} container
   * */
  #replaceContent(content, container) {
    while (true)  {
      let matches = View.regexReplace.exec(content);
      if (!matches)  {
        return content;
      }
      const data = getValue(container, matches[1]);
      if (data == undefined || data == null) {
        return content;
      }
      content = content.replace(
        new RegExp(matches[0], "g"), data);
      }
  }

  connectedCallback() {
  }

  disconnectedCallback() { }
  didRendered() {}

  async componentsConnected() {
    if (this.waitingComponents.length > 1) {
      await Promise.all(this.waitingComponents)
    }
  }
}


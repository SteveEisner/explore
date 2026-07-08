// highlight.js only publishes types for its main entry; the lighter
// "common languages" bundle has the identical API.
declare module "highlight.js/lib/common" {
  import hljs from "highlight.js";
  export default hljs;
}

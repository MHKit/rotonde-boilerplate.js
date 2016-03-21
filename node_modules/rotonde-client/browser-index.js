import newClient from "./node/rotonde-client.js"

// Is that the proper way to do it given index.js is made to be used only by the browser?
window.rotonde = {
    newClient
};

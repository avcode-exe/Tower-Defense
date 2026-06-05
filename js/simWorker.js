let id;
onmessage = function(e) {
    if (e.data === "start") {
        id = setInterval(function() { postMessage("tick"); }, 16);
    } else if (e.data === "stop") {
        clearInterval(id);
    }
};

let id;
onmessage = function(e) {
    if (e.data === "start") {
        // Guard: clear any existing interval before starting a new one
        // to prevent duplicate intervals on double-start.
        if (id) clearInterval(id);
        id = setInterval(function() { postMessage("tick"); }, (1 / 60) * 1000);
    } else if (e.data === "stop") {
        clearInterval(id);
    }
};

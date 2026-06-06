let id;
onmessage = function(e) {
    if (e.data === "start") {
        // Match the game's FIXED_TIMESTEP (1/60 ≈ 16.667ms) for tick-accurate simulation.
        id = setInterval(function() { postMessage("tick"); }, (1 / 60) * 1000);
    } else if (e.data === "stop") {
        clearInterval(id);
    }
};

// Script to find regressions
//
// It should use as few liberator methods as possible, but fall back to standard mozilla/DOM methods
// The reason it, we don't want to find regressions in the regressions script, and it should survive
// massive changes in the internal liberator API, but just test for functionality of
// user-visible commands/mappings
//
// NOTE: It is preferable to run this script in a clean profile or at least do NOT use
// :mkvimperatorrc afterwards, as it can remove commands/mappings, etc.
//
// Usage: :regr[essions]


/////////////////////////////////////////////////////////////////////////////////////////
// Put definitions here which might change due to internal liberator refactoring
/////////////////////////////////////////////////////////////////////////////////////////

var multilineOutput  = document.getElementById("liberator-multiline-output")
var singlelineOutput = document.getElementById("liberator-commandline-command")

/////////////////////////////////////////////////////////////////////////////////////////
// TESTS
//
// They are run in order, so you can specify commands which expect side effects of a
// previous command
/////////////////////////////////////////////////////////////////////////////////////////

// A series of ex commands or mappings, each with a
// function checking whether the command succeeded
// If the string starts with a ":" it is executed as an ex command, otherwise as a mapping
// You can also mix commands mappings
let tests = [
    { cmds: [":!dir"],
      verify: function () Tests.getMultilineOutput().length > 10 },
    { cmds: [":abbr VIMP vimperator labs", ":abbr"],
      verify: function () Tests.getMultilineOutput().indexOf("vimperator labs") >= 0 },
    { cmds: [":unabbr VIMP", ":abbr"],
      verify: function () Tests.getMultilineOutput().indexOf("vimperator labs") == -1 },
    { cmds: [":bmarks"],
      verify: function () Tests.getMultilineOutput().length > 100 },
    { cmds: [":echo \"test\""],
      verify: function () Tests.getOutput() == "test" },
    // { cmds: [":echomsg \"testmsg\""],
    //   verify: function () Tests.getOutput() == "testmsg" },
    // { cmds: [":echoerr \"testerr\""],
    //   verify: function () Tests.getOutput() == "testerr" },
    { cmds: ["gg", "<C-f>"], // NOTE: does not work when there is no page to scroll, we should load a large page before doing these tests
      verify: function () this._initialPos.y != Tests.getBufferPosition().y,
      init: function () this._initialPos = Tests.getBufferPosition() } 
];

// these functions highly depend on the liberator API, so use ex command tests whenever possible
let functions = [
    function () { return bookmarks.get("").length > 0 }, // will fail for people without bookmarks :( Might want to add one before
    function () { return history.get("").length > 0 }
];

/////////////////////////////////////////////////////////////////////////////////////////
// functions below should be as generic as possible, and not require being rewritten
// even after doing major vimperator refactoring
/////////////////////////////////////////////////////////////////////////////////////////

// I want to move the functions to top-level for brevity, but not until we have
// solved the namespace issue of loading simple function () { ... } declarations
// into "modules".
var Tests = {
    resetEnvironment: function ()
    {
        multilineOutput.contentDocument.body.innerHTML = "";
        singlelineOutput.value = "";
    },

    getOutput:           function () multilineOutput.contentDocument.body.textContent || singlelineOutput.value,
    getMultilineOutput:  function () multilineOutput.contentDocument.body.textContent,
    getSinglelineOutput: function () singlelineOutput.value,

    getBufferPosition: function ()
    {
        let win = window.content;
        return { x: win.scrollMaxX ? win.pageXOffset / win.scrollMaxX : 0,
                 y: win.scrollMaxY ? win.pageYOffset / win.scrollMaxY : 0 }
    },

    // TODO: need to find a way to wait for page load
    getLocation: function () window.content.document.location.href
}


commands.addUserCommand(["regr[essions]"],
    "Run regression tests",
    function (args, special)
    {
        // TODO: might need to increase the 'messages' option temprarily
        // TODO: count (better even range) support to just run test 34 of 102
        // TODO: bang support to either: a) run commands like deleting bookmarks which
        //       should only be done in a clean profile or b) run functions and not
        //       just ex command tests; Yet to be decided
        
        function run () 
        {
            let totalTests = tests.length + functions.length;
            let currentTest = 1;

            // 1.) run commands and mappings tests
            tests.forEach(function (test) {
                let testDescription = util.clip(test.cmds.join(" -> "), 80);
                liberator.echomsg("Running test " + currentTest++ + " of " + totalTests + ": " + testDescription);
                Tests.resetEnvironment();
                if ("init" in test)
                    test.init();

                test.cmds.forEach(function (cmd) {
                    if (cmd.indexOf(":") == 0)
                        liberator.execute(cmd);
                    else
                        events.feedkeys(cmd);
                });

                if (!test.verify())
                    liberator.echoerr("Test failed: " + testDescription);
            });

            // 2.) Run function tests
            functions.forEach(function (func) {
                liberator.echomsg("Running test " + currentTest++ + " of " + totalTests + ": " + util.clip(func.toString().replace(/[\s\n]+/gm, " "), 80));
                Tests.resetEnvironment();

                if (!func())
                    liberator.echoerr("Test failed!");
            });

            liberator.execute(":messages");
        }

        if (special)
            run();
        else
            commandline.input("Running tests should always be done in a new profile. Use ! or confirm with 'yes' to continue:", function (res) { if (res == "yes") run(); } );
    },
    {
        bang: true,
        argCount: 0
    });

// vimperator: set et ts=4 sw=4 :

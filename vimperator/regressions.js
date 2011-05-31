// Copyright (c) 2009 by Martin Stubenschrott <stubenschrott@vimperator.org>
//
// This work is licensed for reuse under an MIT license. Details are
// given in the License.txt file included with this file.


// Script to find regressions
//
// It should use as few liberator methods as possible, but fall back to standard mozilla/DOM methods
// The reason is, we don't want to find regressions in the regressions script, and it should survive
// massive changes in the internal liberator API, but just test for functionality of
// user-visible commands/mappings
//
// NOTE: It is preferable to run this script in a clean profile or at least do NOT use
// :mkvimperatorrc afterwards, as it can remove commands/mappings, etc.
//
// Usage: :[count]regr[essions]
// When [count] is given, just run this test. TODO: move to :regressions [spec]?

// all tests
var skipTests = [":bmarks", "gg"];

/////////////////////////////////////////////////////////////////////////////////////////
// Put definitions here which might change due to internal liberator refactoring
/////////////////////////////////////////////////////////////////////////////////////////

var doc; // document where we output status messages
var multilineOutput  = document.getElementById("liberator-multiline-output");
var singlelineOutput = document.getElementById("liberator-message");

/////////////////////////////////////////////////////////////////////////////////////////
// TESTS
//
// They are run in order, so you can specify commands which expect side effects of a
// previous command
/////////////////////////////////////////////////////////////////////////////////////////

// A series of Ex commands or mappings, each with a
// function checking whether the command succeeded
// If the string starts with a ":" it is executed as an Ex command, otherwise as a mapping
// You can also mix commands and mappings
let tests = [
    { cmds: [":!dir"],
      verify: function () getMultilineOutput().length > 10 },
    { cmds: [":abbr VIMP vimperator labs", ":abbr"],
      verify: function () getOutput().indexOf("vimperator labs") >= 0 },
    { cmds: [":unabbr VIMP", ":abbr"],
      verify: function () getOutput().indexOf("vimperator labs") == -1 },
    { cmds: [":bmarks"],
      verify: function () getMultilineOutput().length > 100 },
    { cmds: [":echo \"test\""],
      verify: function () getSinglelineOutput() == "test" },
    { cmds: [":qmark V http://test.vimperator.org", ":qmarks"],
      verify: function () getMultilineOutput().indexOf("test.vimperator.org") >= 0 },
    { cmds: [":javascript liberator.echo('test', commandline.FORCE_MULTILINE)"],
      verify: function () getMultilineOutput() == "test" },
    // { cmds: [":echomsg \"testmsg\""],
    //   verify: function () getOutput() == "testmsg" },
    // { cmds: [":echoerr \"testerr\""],
    //   verify: function () getOutput() == "testerr" },
    { cmds: ["gg", "<C-f>"], // NOTE: does not work when there is no page to scroll, we should load a large page before doing these tests
      verify: function () this._initialPos.y != getBufferPosition().y,
      init: function () this._initialPos = getBufferPosition() }

    // testing tab behavior
];

// these functions highly depend on the liberator API, so use Ex command tests whenever possible
let functions = [
    function () { return bookmarks.get("").length > 0 }, // will fail for people without bookmarks :( Might want to add one before
    function () { return history.get("").length > 0 }
];

/////////////////////////////////////////////////////////////////////////////////////////
// functions below should be as generic as possible, and not require being rewritten
// even after doing major Vimperator refactoring
/////////////////////////////////////////////////////////////////////////////////////////

function resetEnvironment() {
    multilineOutput.contentDocument.body.innerHTML = "";
    singlelineOutput.value = "";
    commandline.close();
    modes.reset();
}

function getOutput()            multilineOutput.contentDocument.body.textContent || singlelineOutput.value;
function getMultilineOutput()   multilineOutput.contentDocument.body.textContent;
function getSinglelineOutput()  singlelineOutput.value;

function getTabIndex() getBrowser().mTabContainer.selectedIndex;
function getTabCount() getBrowser().mTabs.length;

function getBufferPosition() {
    let win = window.content;
    return { x: win.scrollMaxX ? win.pageXOffset / win.scrollMaxX : 0,
             y: win.scrollMaxY ? win.pageYOffset / win.scrollMaxY : 0 }
};

function getLocation() window.content.document.location.href;

function echoLine(str, group) {
    if (!doc)
        return;

    doc.body.appendChild(util.xmlToDom(
            <div highlight={group} style="border: 1px solid gray; white-space: pre; height: 1.5em; line-height: 1.5em;">{str}</div>,
            doc));
}
function echoMulti(str, group) {
    if (!doc)
        return;

    doc.body.appendChild(util.xmlToDom(<div class="ex-command-output"
                style="white-space: nowrap; border: 1px solid black; min-height: 1.5em;"
                highlight={group}>{template.maybeXML(str)}</div>,
            doc));
}

commands.addUserCommand(["regr[essions]"],
    "Run regression tests",
    function (args) {
        // TODO: might need to increase the 'messages' option temporarily
        // TODO: count (better even range) support to just run test 34 of 102
        // TODO: bang support to either: a) run commands like deleting bookmarks which
        //       should only be done in a clean profile or b) run functions and not
        //       just Ex command tests; Yet to be decided

        let updateOutputHeight = null;
        function init() {
            liberator.registerObserver("echoLine", echoLine);
            liberator.registerObserver("echoMultiline", echoMulti);
            liberator.open("chrome://liberator/content/buffer.xhtml", liberator.NEW_TAB);
            events.waitForPageLoad();
            doc = content.document;
            doc.body.setAttributeNS(NS.uri, "highlight", "CmdLine");

            updateOutputHeight = commandline.updateOutputHeight;
            commandline.updateOutputHeight = function (open) {
                let elem = document.getElementById("liberator-multiline-output");
                if (open)
                    elem.collapsed = false;
                elem.height = 0;
            };
        }
        function cleanup() {
            liberator.unregisterObserver("echoLine", echoLine);
            liberator.unregisterObserver("echoMultiline", echoMulti);
            commandline.updateOutputHeight = updateOutputHeight;
        }

        function run() {
            let now = Date.now();
            let totalTests = tests.length + functions.length;
            let successfulTests = 0;
            let skippedTests = 0;
            let currentTest = 0;

            init();

            // TODO: might want to unify 'tests' and 'functions' handling
            // 1.) run commands and mappings tests
            outer:
            for (let [, test] in Iterator(tests)) {
                currentTest++;
                if (args.count >= 1 && currentTest != args.count)
                    continue;

                let testDescription = util.clip(test.cmds.join(" -> "), 80);
                for (let [, cmd] in Iterator(test.cmds)) {
                    if (skipTests.indexOf(cmd) != -1) {
                        skippedTests++;
                        liberator.echomsg("Skipping test " + currentTest + " of " + totalTests + ": " + testDescription);
                        continue outer;
                    }
                };

                commandline.echo("Running test " + currentTest + " of " + totalTests + ": " + testDescription, "Filter", commandline.APPEND_TO_MESSAGES);
                resetEnvironment();
                if ("init" in test)
                    test.init();

                test.cmds.forEach(function (cmd) {
                    if (cmd[0] == ":")
                        liberator.execute(cmd);
                    else
                        events.feedkeys(cmd);
                });

                if (!test.verify())
                    liberator.echoerr("Test " + currentTest + " failed: " + testDescription);
                else
                    successfulTests++;
            }

            // 2.) Run function tests
            for (let [, func] in Iterator(functions)) {
                currentTest++;
                if (args.count >= 1 && currentTest != args.count)
                    continue;

                commandline.echo("Running test " + currentTest + " of " + totalTests + ": " + util.clip(func.toString().replace(/[\s\n]+/gm, " "), 80), "Filter", commandline.APPEND_TO_MESSAGES);
                resetEnvironment();

                if (!func())
                    liberator.echoerr("Test " + currentTest + " failed!");
                else
                    successfulTests++;
            }

            cleanup();

            let runTests = (args.count >= 1 ? 1 : totalTests) - skippedTests;
            XML.ignoreWhitespace = false;
            liberator.echomsg(<e4x>
                          <span style="font-weight: bold">{successfulTests}</span> of <span style="font-weight: bold">{runTests}</span>
                          tests successfully completed (<span style="font-weight: bold">{skippedTests}</span> tests skipped) in
                          <span class="time-total">{((Date.now() - now) / 1000.0)}</span> msec
                      </e4x>.*);
            liberator.execute(":messages");
        }

        if (!args.bang) {
            liberator.echo(<e4x>
                <span style="font-weight: bold">Running tests should always be done in a new profile.</span><br/>

                It should not do any harm to your profile, but your current settings like options,
                abbreviations or mappings might not be in the same state as before running the tests.
                Just make sure, you don't :mkvimperatorrc, after running the tests.<br/><br/>
                <!--' vim. -->

                Use :regressions! to skip this prompt.
            </e4x>.*);
            commandline.input("Type 'yes' to run the tests: ", function (res) { if (res == "yes") run(); } );
            return;
        }
        run();
    },
    {
        bang: true,
        argCount: "0",
        count: true
    });

// vim: set et sts=4 sw=4 :

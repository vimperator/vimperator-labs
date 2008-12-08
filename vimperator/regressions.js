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
// Usage: :[count]regr[essions]
// When [count] is given, just run this test. TODO: move to :regressions [spec]?

// all tests
var skipTests = [":bmarks", "gg"];

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
      verify: function () getMultilineOutput().length > 10 },
    { cmds: [":abbr VIMP vimperator labs", ":abbr"],
      verify: function () getMultilineOutput().indexOf("vimperator labs") >= 0 },
    { cmds: [":unabbr VIMP", ":abbr"],
      verify: function () getMultilineOutput().indexOf("vimperator labs") == -1 },
    { cmds: [":bmarks"],
      verify: function () getMultilineOutput().length > 100 },
    { cmds: [":echo \"test\""],
      verify: function () getSinglelineOutput() == "test" },
    { cmds: [":qmark V http://test.vimperator.org", ":qmarks"],
      verify: function () getMultilineOutput().indexOf("test.vimperator.org") >= 0 },
    // { cmds: [":echomsg \"testmsg\""],
    //   verify: function () getOutput() == "testmsg" },
    // { cmds: [":echoerr \"testerr\""],
    //   verify: function () getOutput() == "testerr" },
    { cmds: ["gg", "<C-f>"], // NOTE: does not work when there is no page to scroll, we should load a large page before doing these tests
      verify: function () this._initialPos.y != getBufferPosition().y,
	  init: function () this._initialPos = getBufferPosition() }

	// testing tab behavior
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

function resetEnvironment()
{
	multilineOutput.contentDocument.body.innerHTML = "";
	singlelineOutput.value = "";
}

function getOutput()            multilineOutput.contentDocument.body.textContent || singlelineOutput.value;
function getMultilineOutput()   multilineOutput.contentDocument.body.textContent;
function getSinglelineOutput()  singlelineOutput.value;

function getTabIndex() getBrowser().mTabContainer.selectedIndex;
function getTabCount() getBrowser().mTabs.length;

function getBufferPosition()
{
	let win = window.content;
	return { x: win.scrollMaxX ? win.pageXOffset / win.scrollMaxX : 0,
			 y: win.scrollMaxY ? win.pageYOffset / win.scrollMaxY : 0 }
};

    // TODO: need to find a way to wait for page load
function getLocation() window.content.document.location.href;



commands.addUserCommand(["regr[essions]"],
    "Run regression tests",
    function (args)
    {
        // TODO: might need to increase the 'messages' option temporarily
        // TODO: count (better even range) support to just run test 34 of 102
        // TODO: bang support to either: a) run commands like deleting bookmarks which
        //       should only be done in a clean profile or b) run functions and not
        //       just ex command tests; Yet to be decided

        function run ()
        {
            let now = Date.now();
            let totalTests = tests.length + functions.length;
            let successfulTests = 0;
			let skippedTests = 0;
            let currentTest = 0;

            // TODO: might want to unify 'tests' and 'functions' handling
            // 1.) run commands and mappings tests
			outer:
            for (let [, test] in Iterator(tests))
            {
                currentTest++;
                if (args.count >= 1 && currentTest != args.count)
                    continue;

                let testDescription = util.clip(test.cmds.join(" -> "), 80);
				for (let [,cmd] in Iterator(test.cmds))
				{
					if (skipTests.indexOf(cmd) != -1)
					{
						skippedTests++;
						liberator.echomsg("Skipping test " + currentTest + " of " + totalTests + ": " + testDescription, 0);
						continue outer;
					}
				};

                liberator.echomsg("Running test " + currentTest + " of " + totalTests + ": " + testDescription, 0);
                resetEnvironment();
                if ("init" in test)
                    test.init();

                test.cmds.forEach(function (cmd) {
                    if (cmd[0] == ":")
					{
                        liberator.execute(cmd);
					}
                    else
						 events.feedkeys(cmd);
                });

                if (!test.verify())
                    liberator.echoerr("Test " + currentTest + " failed: " + testDescription);
                else
					successfulTests++;
            }

            // 2.) Run function tests
            for (let [, func] in Iterator(functions))
            {
                currentTest++;
                if (args.count >= 1 && currentTest != args.count)
                    continue;

                liberator.echomsg("Running test " + currentTest + " of " + totalTests + ": " + util.clip(func.toString().replace(/[\s\n]+/gm, " "), 80));
                resetEnvironment();

                if (!func())
                    liberator.echoerr("Test " + currentTest + " failed!");
                else
                    successfulTests++;
            }

			let runTests = (args.count >= 1 ? 1 : totalTests) - skippedTests;
			liberator.echomsg(<><span style="font-weight: bold">{successfulTests}</span> of <span style="font-weight: bold">{runTests}</span>
			                  tests successfully completed (<span style="font-weight: bold">{skippedTests}</span> tests skipped) in <span class="time-total">{((Date.now() - now) / 1000.0)}</span> msec</>);
            liberator.execute(":messages");
        }

        if (!args.bang)
		{
			XML.prettyPrinting = true;
			liberator.echo(<><span style="font-weight: bold">Running tests should always be done in a new profile.</span><br/></> +
						   <>It should not do any harm to your profile, but your current settings like options, abbreviations or mappings might not be in the same state as before running the tests.</> +
						   <>Just make sure, you don't :mkvimperatorrc, after running the tests.<br/><br/></> +
			               <>Use :regressions! to skip this prompt.</>);
            commandline.input("Type 'yes' to run the tests:", function (res) { if (res == "yes") run(); } );
			return;
		}
		run();
    },
    {
        bang: true,
        argCount: "0",
        count: true
    });

// vimperator: set et ts=4 sw=4 :

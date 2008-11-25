/***** BEGIN LICENSE BLOCK ***** {{{
Version: MPL 1.1/GPL 2.0/LGPL 2.1

The contents of this file are subject to the Mozilla Public License Version
1.1 (the "License"); you may not use this file except in compliance with
the License. You may obtain a copy of the License at
http://www.mozilla.org/MPL/

Software distributed under the License is distributed on an "AS IS" basis,
WITHOUT WARRANTY OF ANY KIND, either express or implied. See the License
for the specific language governing rights and limitations under the
License.

(c) 2006-2008: Martin Stubenschrott <stubenschrott@gmx.net>
    Code based on venkman

Alternatively, the contents of this file may be used under the terms of
either the GNU General Public License Version 2 or later (the "GPL"), or
the GNU Lesser General Public License Version 2.1 or later (the "LGPL"),
in which case the provisions of the GPL or the LGPL are applicable instead
of those above. If you wish to allow use of your version of this file only
under the terms of either the GPL or the LGPL, and not to allow others to
use your version of this file under the terms of the MPL, indicate your
decision by deleting the provisions above and replace them with the notice
and other provisions required by the GPL or the LGPL. If you do not delete
the provisions above, a recipient may use your version of this file under
the terms of any one of the MPL, the GPL or the LGPL.
}}} ***** END LICENSE BLOCK *****/

// TODO: why are we passing around strings rather than file objects?
function IO() //{{{
{
    ////////////////////////////////////////////////////////////////////////////////
    ////////////////////// PRIVATE SECTION /////////////////////////////////////////
    /////////////////////////////////////////////////////////////////////////////{{{

    const WINDOWS = liberator.has("Win32");
    const EXTENSION_NAME = config.name.toLowerCase(); // "vimperator" or "muttator"

    const environmentService = Components.classes["@mozilla.org/process/environment;1"]
                                         .getService(Components.interfaces.nsIEnvironment);
    const directoryService   = Components.classes["@mozilla.org/file/directory_service;1"]
                                         .getService(Components.interfaces.nsIProperties);
    const downloadManager    = Components.classes["@mozilla.org/download-manager;1"]
                                         .createInstance(Components.interfaces.nsIDownloadManager);

    var processDir = directoryService.get("CurWorkD", Components.interfaces.nsIFile);
    var cwd = processDir;
    var oldcwd = null;

    var lastRunCommand = ""; // updated whenever the users runs a command with :!
    var scriptNames = [];

    // default option values
    var cdpath = "," + (environmentService.get("CDPATH").replace(/[:;]/g, ",") || ",");
    var runtimepath = "~/" + (WINDOWS ? "" : ".") + EXTENSION_NAME;
    var shell, shellcmdflag;

    if (WINDOWS)
    {
        shell = "cmd.exe";
        // TODO: setting 'shell' to "something containing sh" updates
        // 'shellcmdflag' appropriately at startup on Windows in Vim
        shellcmdflag = "/c";
    }
    else
    {
        shell = environmentService.get("SHELL") || "sh";
        shellcmdflag = "-c";
    }

    function expandPathList(list) list.split(",").map(io.expandPath).join(",")

    function getPathsFromPathList(list)
    {
        if (!list)
            return [];
        else
            // empty list item means the current directory
            return list.replace(/,$/, "")
                       .split(",")
                       .map(function (dir) dir == "" ? io.getCurrentDirectory().path : dir);
    }

    function replacePathSep(path)
    {
        if (WINDOWS)
            return path.replace("/", "\\");
        return path;
    }

    function joinPaths(head, tail)
    {
        let path = ioManager.getFile(head);
        path.appendRelativePath(ioManager.expandPath(tail)); // FIXME: should only expand env vars and normalise path separators
        return path;
    }

    var downloadListener = {
        onDownloadStateChange: function (state, download)
        {
            if (download.state == downloadManager.DOWNLOAD_FINISHED)
            {
                let url   = download.source.spec;
                let title = download.displayName;
                let file  = download.targetFile.path;
                let size  = download.size;

                liberator.echomsg("Download of " + title + " to " + file + " finished", 1);
                autocommands.trigger("DownloadPost", { url: url, title: title, file: file, size: size });
            }
        },
        onStateChange:    function () {},
        onProgressChange: function () {},
        onSecurityChange: function () {}
    };

    downloadManager.addListener(downloadListener);
    liberator.registerObserver("shutdown", function () {
        downloadManager.removeListener(downloadListener);
    });

    /////////////////////////////////////////////////////////////////////////////}}}
    ////////////////////// OPTIONS ////////////////////////////////////////////////
    /////////////////////////////////////////////////////////////////////////////{{{

    options.add(["cdpath", "cd"],
        "List of directories searched when executing :cd",
        "stringlist", cdpath,
        { setter: function (value) expandPathList(value) });

    options.add(["runtimepath", "rtp"],
        "List of directories searched for runtime files",
        "stringlist", runtimepath,
        { setter: function (value) expandPathList(value) });

    options.add(["shell", "sh"],
        "Shell to use for executing :! and :run commands",
        "string", shell,
        { setter: function (value) io.expandPath(value) });

    options.add(["shellcmdflag", "shcf"],
        "Flag passed to shell when executing :! and :run commands",
        "string", shellcmdflag);

    /////////////////////////////////////////////////////////////////////////////}}}
    ////////////////////// COMMANDS ////////////////////////////////////////////////
    /////////////////////////////////////////////////////////////////////////////{{{

    commands.add(["cd", "chd[ir]"],
        "Change the current directory",
        function (args)
        {
            args = args.literalArg;

            if (!args)
            {
                args = "~";
            }
            else if (args == "-")
            {
                if (oldcwd)
                {
                    args = oldcwd.path;
                }
                else
                {
                    liberator.echoerr("E186: No previous directory");
                    return;
                }
            }

            args = io.expandPath(args);

            // go directly to an absolute path or look for a relative path
            // match in 'cdpath'
            if (/^(~|\/|[a-z]:|\.\/|\.\.\/)/i.test(args))
            {
                // TODO: apparently we don't handle ../ or ./ paths yet
                if (io.setCurrentDirectory(args))
                    liberator.echo(io.getCurrentDirectory().path);
            }
            else
            {
                let dirs = getPathsFromPathList(options["cdpath"]);
                let found = false;

                for (let [,dir] in Iterator(dirs))
                {
                    dir = joinPaths(dir, args);

                    if (dir.exists() && dir.isDirectory() && dir.isReadable())
                    {
                        io.setCurrentDirectory(dir.path);
                        liberator.echo(io.getCurrentDirectory().path);
                        found = true;
                        break;
                    }
                }

                if (!found)
                {
                    liberator.echoerr("E344: Can't find directory \"" + args + "\" in cdpath"
                                    + "\n"
                                    + "E472: Command failed");
                }
            }
        },
        {
            argCount: "?",
            completer: function (context) completion.file(context, true),
            literal: true
        });

    // NOTE: this command is only used in :source
    commands.add(["fini[sh]"],
        "Stop sourcing a script file",
        function () { liberator.echoerr("E168: :finish used outside of a sourced file"); },
        { argCount: "0" });

    commands.add(["pw[d]"],
        "Print the current directory name",
        function () { liberator.echo(io.getCurrentDirectory().path); },
        { argCount: "0" });

    // "mkv[imperatorrc]" or "mkm[uttatorrc]"
    commands.add([EXTENSION_NAME.replace(/(.)(.*)/, "mk$1[$2rc]")],
        "Write current key mappings and changed options to the config file",
        function (args, special)
        {
            // TODO: "E172: Only one file name allowed"
            let filename = args.arguments[0] || "~/" + (WINDOWS ? "_" : ".") + EXTENSION_NAME + "rc";
            let file = io.getFile(filename);

            if (file.exists() && !special)
            {
                liberator.echoerr("E189: \"" + filename + "\" exists (add ! to override)");
                return;
            }

            // FIXME: Use a set/specifiable list here:
            let lines = [cmd.serial().map(commands.commandToString) for (cmd in commands) if (cmd.serial)];
            lines = util.Array.flatten(lines);

            // :mkvimrc doesn't save autocommands, so we don't either - remove this code at some point
            // line += "\n\" Auto-Commands\n";
            // for (let item in autocommands)
            //     line += "autocmd " + item.event + " " + item.pattern.source + " " + item.command + "\n";

            // if (mappings.getMapLeader() != "\\")
            //    line += "\nlet mapleader = \"" + mappings.getMapLeader() + "\"\n";

            // source a user .vimperatorrc file
            lines.unshift('"' + liberator.version);
            lines.push("\nsource! " + filename + ".local");
            lines.push("\n\" vim: set ft=vimperator:");

            try
            {
                io.writeFile(file, lines.join("\n"));
            }
            catch (e)
            {
                liberator.echoerr("E190: Cannot open \"" + filename + "\" for writing");
                liberator.log("Could not write to " + file.path + ": " + e.message); // XXX
            }
        },
        {
            argCount: "?",
            bang: true,
            completer: function (context) completion.file(context, true)
        });

    commands.add(["runt[ime]"],
        "Source the specified file from each directory in 'runtimepath'",
        function (args, special) { io.sourceFromRuntimePath(args.arguments, special); },
        {
            argCount: "+",
            bang: true
        }
    );

    commands.add(["scrip[tnames]"],
        "List all sourced script names",
        function ()
        {
            var list = template.tabular(["<SNR>", "Filename"], ["text-align: right; padding-right: 1em;"],
                ([i + 1, file] for ([i, file] in Iterator(scriptNames))));  // TODO: add colon?

            commandline.echo(list, commandline.HL_NORMAL, commandline.FORCE_MULTILINE);
        },
        { argCount: "0" });

    commands.add(["so[urce]"],
        "Read Ex commands from a file",
        function (args, special)
        {
            // FIXME: "E172: Only one file name allowed"
            io.source(args.arguments[0], special);
        },
        {
            argCount: "1",
            bang: true,
            completer: function (context) completion.file(context, true)
        });

    commands.add(["!", "run"],
        "Run a command",
        function (args, special)
        {
            args = args.string;

            // :!! needs to be treated specially as the command parser sets the
            // special flag but removes the ! from args
            if (special)
                args = "!" + args;

            // replaceable bang and no previous command?
            if (/((^|[^\\])(\\\\)*)!/.test(args) && !lastRunCommand)
            {
                liberator.echoerr("E34: No previous command");
                return;
            }

            // NOTE: Vim doesn't replace ! preceded by 2 or more backslashes and documents it - desirable?
            // pass through a raw bang when escaped or substitute the last command
            args = args.replace(/(\\)*!/g,
                function (m) /^\\(\\\\)*!$/.test(m) ? m.replace("\\!", "!") : m.replace("!", lastRunCommand)
            );

            lastRunCommand = args;

            let output = io.system(args);
            let command = ":" + util.escapeHTML(commandline.getCommand()) + "<br/>";

            liberator.echo(command + util.escapeHTML(output));

            autocommands.trigger("ShellCmdPost", {});
        },
        {
            bang: true,
            completer: function (context) completion.shellCommand(context),
            literal: true
        });

    /////////////////////////////////////////////////////////////////////////////}}}
    ////////////////////// PUBLIC SECTION //////////////////////////////////////////
    /////////////////////////////////////////////////////////////////////////////{{{

    liberator.registerObserver("load_completion", function ()
    {
        completion.setFunctionCompleter([ioManager.getFile, ioManager.expandPath],
            [function (obj, arg) completion.runCompleter("file", arg)]);
    });

    var ioManager = {

        MODE_RDONLY: 0x01,
        MODE_WRONLY: 0x02,
        MODE_RDWR: 0x04,
        MODE_CREATE: 0x08,
        MODE_APPEND: 0x10,
        MODE_TRUNCATE: 0x20,
        MODE_SYNC: 0x40,
        MODE_EXCL: 0x80,

        sourcing: null,

        expandPath: function (path)
        {
            // TODO: proper pathname separator translation like Vim - this should be done elsewhere
            if (WINDOWS)
                path = path.replace("/", "\\", "g");

            // expand "~" to VIMPERATOR_HOME or HOME (USERPROFILE or HOMEDRIVE\HOMEPATH on Windows if HOME is not set)
            if (/^~/.test(path))
            {
                let home = environmentService.get("VIMPERATOR_HOME");

                if (!home)
                    home = environmentService.get("HOME");

                if (WINDOWS && !home)
                    home = environmentService.get("USERPROFILE") ||
                           environmentService.get("HOMEDRIVE") + environmentService.get("HOMEPATH");

                path = home + path.substr(1);
            }

            // expand any $ENV vars - this is naive but so is Vim and we like to be compatible
            // TODO: Vim does not expand variables set to an empty string, nor does it recognise
            // ${VAR} on WINDOWS - are we just matching bugs?
            // Yes. --Kris
            path = path.replace(
                WINDOWS ? /\$(\w+)\b|%(\w+)%/g : /\$(\w+)\b|\${(\w+)}/g,
                function (m, n1, n2, i, s) environmentService.get((n1 || n2), "$1")
            );

            return path.replace("\\ ", " ", "g");
        },

        // TODO: there seems to be no way, short of a new component, to change
        // Firefox's CWD - see // https://bugzilla.mozilla.org/show_bug.cgi?id=280953
        getCurrentDirectory: function ()
        {
            let dir = ioManager.getFile(cwd.path);

            // NOTE: the directory could have been deleted underneath us so
            // fallback to Firefox's CWD
            if (dir.exists() && dir.isDirectory())
                return dir;
            else
                return processDir;
        },

        setCurrentDirectory: function (newdir)
        {
            newdir = newdir || "~";

            if (newdir == "-")
            {
                [cwd, oldcwd] = [oldcwd, this.getCurrentDirectory()];
            }
            else
            {
                let dir = ioManager.getFile(newdir);

                if (!dir.exists() || !dir.isDirectory())
                {
                    liberator.echoerr("E344: Can't find directory \"" + dir.path + "\" in path");
                    return null;
                }

                [cwd, oldcwd] = [dir, this.getCurrentDirectory()];
            }

            return ioManager.getCurrentDirectory();
        },

        getRuntimeDirectories: function (specialDirectory)
        {
            let dirs = getPathsFromPathList(options["runtimepath"]);

            dirs = dirs.map(function (dir) joinPaths(dir, specialDirectory))
                       .filter(function (dir) dir.exists() && dir.isDirectory() && dir.isReadable());

            return dirs;
        },

        getRCFile: function (dir)
        {
            dir = dir || "~";

            let rcFile1 = joinPaths(dir, "." + EXTENSION_NAME + "rc");
            let rcFile2 = joinPaths(dir, "_" + EXTENSION_NAME + "rc");

            if (WINDOWS)
                [rcFile1, rcFile2] = [rcFile2, rcFile1];

            if (rcFile1.exists() && rcFile1.isFile())
                return rcFile1;
            else if (rcFile2.exists() && rcFile2.isFile())
                return rcFile2;
            else
                return null;
        },

        // return a nsILocalFile for path where you can call isDirectory(), etc. on
        // caller must check with .exists() if the returned file really exists
        // also expands relative paths
        getFile: function (path, noCheckPWD)
        {
            let file = Components.classes["@mozilla.org/file/local;1"]
                                 .createInstance(Components.interfaces.nsILocalFile);
            let protocolHandler = Components.classes["@mozilla.org/network/protocol;1?name=file"]
                                            .createInstance(Components.interfaces.nsIFileProtocolHandler);

            if (/file:\/\//.test(path))
            {
                file = protocolHandler.getFileFromURLSpec(path);
            }
            else
            {
                let expandedPath = ioManager.expandPath(path);

                if (!/^([a-zA-Z]:|\/)/.test(expandedPath) && !noCheckPWD) // doesn't start with /, C:
                    file = joinPaths(ioManager.getCurrentDirectory().path, expandedPath);
                else
                    file.initWithPath(expandedPath);
            }

            return file;
        },

        // TODO: make secure
        // returns a nsILocalFile or null if it could not be created
        createTempFile: function ()
        {
            let tmpName = EXTENSION_NAME + ".tmp";

            switch (EXTENSION_NAME)
            {
                case "muttator":
                    tmpName = "mutt-ator-mail"; // to allow vim to :set ft=mail automatically
                    break;
                case "vimperator":
                    try
                    {
                        if (window.content.document.location.hostname)
                            tmpName = EXTENSION_NAME + "-" + window.content.document.location.hostname + ".tmp";
                    }
                    catch (e) {}
                    break;
            }

            let file = directoryService.get("TmpD", Components.interfaces.nsIFile);
            file.append(tmpName);
            file.createUnique(Components.interfaces.nsIFile.NORMAL_FILE_TYPE, 0600);

            if (file.exists())
                return file;
            else
                return null; // XXX

        },

        // file is either a full pathname or an instance of file instanceof nsILocalFile
        readDirectory: function (file, sort)
        {
            if (typeof file == "string")
                file = ioManager.getFile(file);
            else if (!(file instanceof Components.interfaces.nsILocalFile))
                throw Components.results.NS_ERROR_INVALID_ARG; // FIXME: does not work as expected, just shows undefined: undefined

            if (file.isDirectory())
            {
                var entries = file.directoryEntries;
                var array = [];
                while (entries.hasMoreElements())
                {
                    var entry = entries.getNext();
                    entry.QueryInterface(Components.interfaces.nsIFile);
                    array.push(entry);
                }
                if (sort)
                    return array.sort(function (a, b) b.isDirectory() - a.isDirectory() ||  String.localeCompare(a.path, b.path));
                return array;
            }
            else
                return []; // XXX: or should it throw an error, probably yes?
        },

        // file is either a full pathname or an instance of file instanceof nsILocalFile
        // reads a file in "text" mode and returns the string
        readFile: function (file)
        {
            var ifstream = Components.classes["@mozilla.org/network/file-input-stream;1"]
                                     .createInstance(Components.interfaces.nsIFileInputStream);
            var icstream = Components.classes["@mozilla.org/intl/converter-input-stream;1"]
                                     .createInstance(Components.interfaces.nsIConverterInputStream);

            var charset = "UTF-8";
            if (typeof file == "string")
                file = ioManager.getFile(file);
            else if (!(file instanceof Components.interfaces.nsILocalFile))
                throw Components.results.NS_ERROR_INVALID_ARG; // FIXME: does not work as expected, just shows undefined: undefined

            ifstream.init(file, -1, 0, 0);
            const replacementChar = Components.interfaces.nsIConverterInputStream.DEFAULT_REPLACEMENT_CHARACTER;
            icstream.init(ifstream, charset, 4096, replacementChar); // 4096 bytes buffering

            var buffer = "";
            var str = {};
            while (icstream.readString(4096, str) != 0)
                buffer += str.value;

            icstream.close();
            ifstream.close();

            return buffer;
        },

        // file is either a full pathname or an instance of file instanceof nsILocalFile
        // default permission = 0644, only used when creating a new file, does not change permissions if the file exists
        // mode can be ">" or ">>" in addition to the normal MODE_* flags
        writeFile: function (file, buf, mode, perms)
        {
            var ofstream = Components.classes["@mozilla.org/network/file-output-stream;1"]
                                     .createInstance(Components.interfaces.nsIFileOutputStream);
            var ocstream = Components.classes["@mozilla.org/intl/converter-output-stream;1"]
                                     .createInstance(Components.interfaces.nsIConverterOutputStream);

            var charset = "UTF-8"; // Can be any character encoding name that Mozilla supports
            if (typeof file == "string")
                file = ioManager.getFile(file);
            else if (!(file instanceof Components.interfaces.nsILocalFile))
                throw Components.results.NS_ERROR_INVALID_ARG; // FIXME: does not work as expected, just shows undefined: undefined

            if (mode == ">>")
                mode = ioManager.MODE_WRONLY | ioManager.MODE_CREATE | ioManager.MODE_APPEND;
            else if (!mode || mode == ">")
                mode = ioManager.MODE_WRONLY | ioManager.MODE_CREATE | ioManager.MODE_TRUNCATE;

            if (!perms)
                perms = 0644;

            ofstream.init(file, mode, perms, 0);
            ocstream.init(ofstream, charset, 0, 0x0000);
            ocstream.writeString(buf);

            ocstream.close();
            ofstream.close();
        },

        run: function (program, args, blocking)
        {
            if (!args)
                args = [];

            if (typeof blocking != "boolean")
                blocking = false;

            try
            {
                var file = ioManager.getFile(program, !WINDOWS);
            }
            catch (e)
            {
                var dirs = environmentService.get("PATH").split(WINDOWS ? ";" : ":");
lookup:
                for (let [,dir] in Iterator(dirs))
                {
                    file = joinPaths(dir, program);
                    try
                    {
                        if (file.exists())
                            break;

                        // TODO: couldn't we just palm this off to the start command?
                        // automatically try to add the executable path extensions on windows
                        if (WINDOWS)
                        {
                            let extensions = environmentService.get("PATHEXT").split(";");
                            for (let [,extension] in Iterator(extension))
                            {
                                file = joinPaths(dir, program + extension);
                                if (file.exists())
                                    break lookup;
                            }
                        }
                    }
                    catch (e) {}
                }
            }

            if (!file.exists())
            {
                liberator.echoerr("Command not found: " + program);
                return -1;
            }

            var process = Components.classes["@mozilla.org/process/util;1"]
                                    .createInstance(Components.interfaces.nsIProcess);

            process.init(file);
            process.run(blocking, args, args.length);

            return process.exitValue;
        },

        // when https://bugzilla.mozilla.org/show_bug.cgi?id=68702 is fixed
        // is fixed, should use that instead of a tmpfile
        system: function (command, input)
        {
            liberator.echomsg("Calling shell to execute: " + command, 4);

            var stdoutFile = ioManager.createTempFile();
            var stderrFile = ioManager.createTempFile();

            function escapeQuotes(str) str.replace('"', '\\"', "g");

            if (!stdoutFile || !stderrFile) // FIXME: error reporting
                return "";

            if (WINDOWS)
                command = "cd /D " + cwd.path + " && " + command + " > " + stdoutFile.path + " 2> " + stderrFile.path;
            else
                // TODO: should we only attempt the actual command conditionally on a successful cd?
                command = "cd " + escapeQuotes(cwd.path) + "; " + command + " > \"" + escapeQuotes(stdoutFile.path) + "\""
                            + " 2> \"" + escapeQuotes(stderrFile.path) + "\"";

            var stdinFile = null;

            if (input)
            {
                stdinFile = ioManager.createTempFile(); // FIXME: no returned file?
                ioManager.writeFile(stdinFile, input);
                command += " < \"" + escapeQuotes(stdinFile.path) + "\"";
            }

            var res = ioManager.run(options["shell"], [options["shellcmdflag"], command], true);

            if (res > 0)
                var output = ioManager.readFile(stderrFile) + "\nshell returned " + res;
            else
                var output = ioManager.readFile(stdoutFile);

            stdoutFile.remove(false);
            stderrFile.remove(false);

            if (stdinFile)
                stdinFile.remove(false);

            // if there is only one \n at the end, chop it off
            if (output && output.indexOf("\n") == output.length - 1)
                output = output.substr(0, output.length - 1);

            return output;
        },

        // FIXME: multiple paths?
        sourceFromRuntimePath: function (paths, all)
        {
            let dirs = getPathsFromPathList(options["runtimepath"]);
            let found = false;

            // FIXME: should use original arg string
            liberator.echomsg("Searching for \"" + paths.join(" ") + "\" in \"" + options["runtimepath"] + "\"", 2);

            outer:
            for (let [,dir] in Iterator(dirs))
            {
                for (let [,path] in Iterator(paths))
                {
                    let file = joinPaths(dir, path);

                    liberator.echomsg("Searching for \"" + file.path, 3);

                    if (file.exists() && file.isFile() && file.isReadable())
                    {
                        io.source(file.path, false);
                        found = true;

                        if (!all)
                            break outer;
                    }
                }
            }

            if (!found)
                liberator.echomsg("not found in 'runtimepath': \"" + paths.join(" ") + "\"", 1); // FIXME: should use original arg string

            return found;
        },

        // files which end in .js are sourced as pure javascript files,
        // no need (actually forbidden) to add: js <<EOF ... EOF around those files
        source: function (filename, silent)
        {
            var wasSourcing = ioManager.sourcing;
            try
            {
                var file = ioManager.getFile(filename);
                ioManager.sourcing = {
                    file: file.path,
                    line: 0
                };

                if (!file.exists() || !file.isReadable() || file.isDirectory())
                {
                    if (!silent)
                    {
                        if (file.exists() && file.isDirectory())
                            liberator.echomsg("Cannot source a directory: \"" + filename + "\"", 0);
                        else
                            liberator.echomsg("could not source: \"" + filename + "\"", 1);

                        liberator.echoerr("E484: Can't open file " + filename);
                    }

                    return;
                }

                liberator.echomsg("sourcing \"" + filename + "\"", 2);

                let str = ioManager.readFile(file);
                let uri = makeFileURI(file);

                // handle pure javascript files specially
                if (/\.js$/.test(filename))
                {
                    var loader = Components.classes["@mozilla.org/moz/jssubscript-loader;1"]
                                           .getService(Components.interfaces.mozIJSSubScriptLoader);
                    try
                    {
                        loader.loadSubScript(uri.spec, plugins);
                    }
                    catch (e)
                    {
                        let err = new Error();
                        for (let [k, v] in Iterator(e))
                            err[k] = v;
                        err.echoerr = file.path + ":" + e.lineNumber + ": " + e;
                        throw err;
                    }
                }
                else if (/\.css$/.test(filename))
                {
                    storage.styles.registerSheet(uri.spec, !silent, true);
                }
                else
                {
                    let heredoc = "";
                    let heredocEnd = null; // the string which ends the heredoc
                    let lines = str.split("\n");

                    for (let [i, line] in Iterator(lines))
                    {
                        if (heredocEnd) // we already are in a heredoc
                        {
                            if (heredocEnd.test(line))
                            {
                                command.execute(heredoc, special, count);
                                heredoc = "";
                                heredocEnd = null;
                            }
                            else
                            {
                                heredoc += line + "\n";
                            }
                        }
                        else
                        {
                            ioManager.sourcing.line = i + 1;
                            // skip line comments and blank lines
                            if (/^\s*(".*)?$/.test(line))
                                continue;

                            var [count, cmd, special, args] = commands.parseCommand(line);
                            var command = commands.get(cmd);

                            if (!command)
                            {
                                let lineNumber = i + 1;

                                // FIXME: messages need to be able to specify
                                // whether they can be cleared/overwritten or
                                // should be appended to and the MOW opened
                                liberator.echoerr("Error detected while processing " + file.path,
                                    commandline.FORCE_MULTILINE);
                                commandline.echo("line " + lineNumber + ":", commandline.HL_LINENR,
                                    commandline.APPEND_TO_MESSAGES);
                                liberator.echoerr("E492: Not an editor command: " + line);
                            }
                            else
                            {
                                if (command.name == "finish")
                                {
                                    break;
                                }
                                else if (command.hereDoc)
                                {
                                    // check for a heredoc
                                    let matches = args.match(/(.*)<<\s*(\S+)$/);

                                    if (matches)
                                    {
                                        args = matches[1];
                                        heredocEnd = new RegExp("^" + matches[2] + "$", "m");
                                        if (matches[1])
                                            heredoc = matches[1] + "\n";
                                    }
                                    else
                                    {
                                        command.execute(args, special, count);
                                    }
                                }
                                else
                                {
                                    // execute a normal liberator command
                                    liberator.execute(line);
                                }
                            }
                        }
                    }

                    // if no heredoc-end delimiter is found before EOF then
                    // process the heredoc anyway - Vim compatible ;-)
                    if (heredocEnd)
                        command.execute(heredoc, special, count);
                }

                if (scriptNames.indexOf(file.path) == -1)
                    scriptNames.push(file.path);

                liberator.echomsg("finished sourcing \"" + filename + "\"", 2);

                liberator.log("Sourced: " + file.path, 3);
            }
            catch (e)
            {
                let message = "Sourcing file: " + (e.echoerr || file.path + ": " + e);
                liberator.reportError(e);
                if (!silent)
                    liberator.echoerr(message);
            }
            finally
            {
                ioManager.sourcing = wasSourcing;
            }
        }
    }; //}}}

    return ioManager;

}; //}}}

// vim: set fdm=marker sw=4 ts=4 et:

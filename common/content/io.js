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

Copyright (c) 2006-2009 by Martin Stubenschrott <stubenschrott@gmx.net>
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

/** @scope modules */

plugins.contexts = {};
function Script(file)
{
    let self = plugins.contexts[file.path];
    if (self)
    {
        if (self.onUnload)
            self.onUnload();
        return self;
    }
    plugins.contexts[file.path] = this;
    this.NAME = file.leafName.replace(/\..*/, "").replace(/-([a-z])/g, function (m, n1) n1.toUpperCase());
    this.PATH = file.path;
    this.__context__ = this;

    // This belongs elsewhere
    for (let [,dir] in Iterator(io.getRuntimeDirectories("plugin")))
    {
        if (dir.contains(file, false))
            plugins[this.NAME] = this;
    }
}
Script.prototype = plugins;

// TODO: why are we passing around strings rather than file objects?
/**
 * Provides a basic interface to common system I/O operations.
 * @instance io
 */
function IO() //{{{
{
    ////////////////////////////////////////////////////////////////////////////////
    ////////////////////// PRIVATE SECTION /////////////////////////////////////////
    /////////////////////////////////////////////////////////////////////////////{{{

    const WINDOWS = liberator.has("Win32");
    const EXTENSION_NAME = config.name.toLowerCase(); // "vimperator" or "muttator"

    const downloadManager = Cc["@mozilla.org/download-manager;1"].createInstance(Ci.nsIDownloadManager);
    const ioService = services.get("io");

    var processDir = services.get("directory").get("CurWorkD", Ci.nsIFile);
    var cwd = processDir;
    var oldcwd = null;

    var lastRunCommand = ""; // updated whenever the users runs a command with :!
    var scriptNames = [];

    // default option values
    var cdpath = "," + (services.get("environment").get("CDPATH").replace(/[:;]/g, ",") || ",");
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
        shell = services.get("environment").get("SHELL") || "sh";
        shellcmdflag = "-c";
    }

    function expandPathList(list) list.split(",").map(io.expandPath).join(",")

    function getPathsFromPathList(list)
    {
        if (!list)
            return [];
        else
            // empty list item means the current directory
            return list.replace(/,$/, "").split(",")
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
        let path = self.getFile(head);
        try
        {
            path.appendRelativePath(self.expandPath(tail, true)); // FIXME: should only expand env vars and normalise path separators
            if (path.exists() && path.normalize)
                path.normalize();
        }
        catch (e)
        {
            return { exists: function () false, __noSuchMethod__: function () { throw e; } };
        }
        return path;
    }

    function isAbsolutePath(path)
    {
        try
        {
            services.create("file").initWithPath(path);
            return true;
        }
        catch (e)
        {
            return false;
        }
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
        "stringlist", IO.runtimePath,
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
            let arg = args.literalArg;

            if (!arg)
            {
                arg = "~";
            }
            else if (arg == "-")
            {
                if (oldcwd)
                {
                    arg = oldcwd.path;
                }
                else
                {
                    liberator.echoerr("E186: No previous directory");
                    return;
                }
            }

            arg = io.expandPath(arg);

            // go directly to an absolute path or look for a relative path
            // match in 'cdpath'
            // TODO: handle ../ and ./ paths
            if (isAbsolutePath(arg))
            {
                if (io.setCurrentDirectory(arg))
                    liberator.echomsg(io.getCurrentDirectory().path);
            }
            else
            {
                let dirs = getPathsFromPathList(options["cdpath"]);
                let found = false;

                for (let [,dir] in Iterator(dirs))
                {
                    dir = joinPaths(dir, arg);

                    if (dir.exists() && dir.isDirectory() && dir.isReadable())
                    {
                        io.setCurrentDirectory(dir.path);
                        liberator.echomsg(io.getCurrentDirectory().path);
                        found = true;
                        break;
                    }
                }

                if (!found)
                {
                    liberator.echoerr("E344: Can't find directory " + arg.quote() + " in cdpath\n"
                                    + "E472: Command failed");
                }
            }
        },
        {
            argCount: "?",
            completer: function (context) completion.directory(context, true),
            literal: 0
        });

    // NOTE: this command is only used in :source
    commands.add(["fini[sh]"],
        "Stop sourcing a script file",
        function () { liberator.echoerr("E168: :finish used outside of a sourced file"); },
        { argCount: "0" });

    commands.add(["pw[d]"],
        "Print the current directory name",
        function () { liberator.echomsg(io.getCurrentDirectory().path); },
        { argCount: "0" });

    // "mkv[imperatorrc]" or "mkm[uttatorrc]"
    commands.add([EXTENSION_NAME.replace(/(.)(.*)/, "mk$1[$2rc]")],
        "Write current key mappings and changed options to the config file",
        function (args)
        {
            // TODO: "E172: Only one file name allowed"
            let filename = args[0] || "~/" + (WINDOWS ? "_" : ".") + EXTENSION_NAME + "rc";
            let file = io.getFile(filename);

            if (file.exists() && !args.bang)
            {
                liberator.echoerr("E189: " + filename.quote() + " exists (add ! to override)");
                return;
            }

            // TODO: Use a set/specifiable list here:
            let lines = [cmd.serial().map(commands.commandToString) for (cmd in commands) if (cmd.serial)];
            lines = util.Array.flatten(lines);

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
                liberator.echoerr("E190: Cannot open " + filename.quote() + " for writing");
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
        function (args) { io.sourceFromRuntimePath(args, args.bang); },
        {
            argCount: "+",
            bang: true
        }
    );

    commands.add(["scrip[tnames]"],
        "List all sourced script names",
        function ()
        {
            let list = template.tabular(["<SNR>", "Filename"], ["text-align: right; padding-right: 1em;"],
                ([i + 1, file] for ([i, file] in Iterator(scriptNames))));  // TODO: add colon?

            commandline.echo(list, commandline.HL_NORMAL, commandline.FORCE_MULTILINE);
        },
        { argCount: "0" });

    commands.add(["so[urce]"],
        "Read Ex commands from a file",
        function (args)
        {
            // FIXME: "E172: Only one file name allowed"
            io.source(args[0], args.bang);
        },
        {
            argCount: "1",
            bang: true,
            completer: function (context) completion.file(context, true)
        });

    commands.add(["!", "run"],
        "Run a command",
        function (args)
        {
            let arg = args.literalArg;

            // :!! needs to be treated specially as the command parser sets the
            // bang flag but removes the ! from arg
            if (args.bang)
                arg = "!" + arg;

            // replaceable bang and no previous command?
            if (/((^|[^\\])(\\\\)*)!/.test(arg) && !lastRunCommand)
            {
                liberator.echoerr("E34: No previous command");
                return;
            }

            // NOTE: Vim doesn't replace ! preceded by 2 or more backslashes and documents it - desirable?
            // pass through a raw bang when escaped or substitute the last command
            arg = arg.replace(/(\\)*!/g,
                function (m) /^\\(\\\\)*!$/.test(m) ? m.replace("\\!", "!") : m.replace("!", lastRunCommand)
            );

            lastRunCommand = arg;

            let output = io.system(arg);

            commandline.echo(template.commandOutput(<span highlight="CmdOutput">{output}</span>));

            autocommands.trigger("ShellCmdPost", {});
        },
        {
            argCount: "?", // TODO: "1" - probably not worth supporting weird Vim edge cases. The dream is dead. --djk
            bang: true,
            completer: function (context) completion.shellCommand(context),
            literal: 0
        });

    /////////////////////////////////////////////////////////////////////////////}}}
    ////////////////////// PUBLIC SECTION //////////////////////////////////////////
    /////////////////////////////////////////////////////////////////////////////{{{

    liberator.registerObserver("load_completion", function ()
    {
        completion.setFunctionCompleter([self.getFile, self.expandPath],
            [function (context, obj, args) {
                context.quote[2] = "";
                completion.file(context, true);
            }]);
    });

    const self = {

        /**
         * @property {number} Open for reading only.
         * @final
         */
        MODE_RDONLY: 0x01,

        /**
         * @property {number} Open for writing only.
         * @final
         */
        MODE_WRONLY: 0x02,

        /**
         * @property {number} Open for reading and writing.
         * @final
         */
        MODE_RDWR: 0x04,

        /**
         * @property {number} If the file does not exist, the file is created.
         *     If the file exists, this flag has no effect.
         * @final
         */
        MODE_CREATE: 0x08,

        /**
         * @property {number} The file pointer is set to the end of the file
         *     prior to each write.
         * @final
         */
        MODE_APPEND: 0x10,

        /**
         * @property {number} If the file exists, its length is truncated to 0.
         * @final
         */
        MODE_TRUNCATE: 0x20,

        /**
         * @property {number} If set, each write will wait for both the file
         *     data and file status to be physically updated.
         * @final
         */
        MODE_SYNC: 0x40,

        /**
         * @property {number} With MODE_CREATE, if the file does not exist, the
         *     file is created. If the file already exists, no action and NULL
         *     is returned.
         * @final
         */
        MODE_EXCL: 0x80,

        /**
         * @property {Object} The current file sourcing context. As a file is
         *     being sourced the 'file' and 'line' properties of this context
         *     object are updated appropriately.
         */
        sourcing: null,

        /**
         * @property {string} The OS's path separator.
         */
        pathSeparator: WINDOWS ? "\\" : "/",

        /**
         * Expands "~" and environment variables in <b>path</b>.
         *
         * "~" is expanded to to the value of $HOME. On Windows if this is not
         * set then the following are tried in order:
         *   $USERPROFILE
         *   ${HOMDRIVE}$HOMEPATH
         *
         * The variable notation is $VAR (terminated by a non-word character)
         * or ${VAR}. %VAR% is also supported on Windows.
         *
         * @param {string} path The unexpanded path string.
         * @param {boolean} relative Whether the path is relative or absolute.
         * @returns {string}
         */
        expandPath: IO.expandPath,

        // TODO: there seems to be no way, short of a new component, to change
        // Firefox's CWD - see // https://bugzilla.mozilla.org/show_bug.cgi?id=280953
        /**
         * Returns the current working directory.
         *
         * It's not possible to change the real CWD of Firefox so this state is
         * maintained internally. External commands run via {@link #system} are
         * executed in this directory.
         *
         * @returns {nsIFile}
         */
        getCurrentDirectory: function ()
        {
            let dir = self.getFile(cwd.path);

            // NOTE: the directory could have been deleted underneath us so
            // fallback to Firefox's CWD
            if (dir.exists() && dir.isDirectory())
                return dir;
            else
                return processDir;
        },

        /**
         * Sets the current working directory.
         *
         * @param {string} newDir The new CWD. This may be a relative or
         *     absolute path and is expanded by {@link #expandPath}.
         */
        setCurrentDirectory: function (newDir)
        {
            newDir = newDir || "~";

            if (newDir == "-")
            {
                [cwd, oldcwd] = [oldcwd, this.getCurrentDirectory()];
            }
            else
            {
                let dir = self.getFile(newDir);

                if (!dir.exists() || !dir.isDirectory())
                {
                    liberator.echoerr("E344: Can't find directory " + dir.path.quote() + " in path");
                    return null;
                }

                [cwd, oldcwd] = [dir, this.getCurrentDirectory()];
            }

            return self.getCurrentDirectory();
        },

        /**
         * Returns all directories named <b>name<b/> in 'runtimepath'.
         *
         * @param {string} name
         * @returns {nsIFile[])
         */
        getRuntimeDirectories: function (name)
        {
            let dirs = getPathsFromPathList(options["runtimepath"]);

            dirs = dirs.map(function (dir) joinPaths(dir, name))
                       .filter(function (dir) dir.exists() && dir.isDirectory() && dir.isReadable());

            return dirs;
        },

        /**
         * Returns the first user RC file found in <b>dir</b>.
         *
         * @param {string} dir The directory to search.
         * @default $HOME.
         */
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
        /**
         * Returns an nsIFile object for <b>path</b>, which is expanded
         * according to {@link #expandPath}.
         *
         * @param {string} path The path used to create the file object.
         * @param {boolean} noCheckPWD Whether to allow a relative path.
         * @returns {nsIFile}
         */
        getFile: function (path, noCheckPWD)
        {
            let file = services.create("file");

            if (/file:\/\//.test(path))
            {
                file = Cc["@mozilla.org/network/protocol;1?name=file"].createInstance(Ci.nsIFileProtocolHandler)
                                 .getFileFromURLSpec(path);
            }
            else
            {
                let expandedPath = self.expandPath(path);

                if (!isAbsolutePath(expandedPath) && !noCheckPWD)
                    file = joinPaths(self.getCurrentDirectory().path, expandedPath);
                else
                    file.initWithPath(expandedPath);
            }

            return file;
        },

        // TODO: make secure
        /**
         * Creates a temporary file.
         *
         * @returns {nsIFile}
         */
        createTempFile: function ()
        {
            let tmpName = EXTENSION_NAME + ".tmp";

            switch (EXTENSION_NAME)
            {
                case "muttator":
                    tmpName = "mutt-ator-mail"; // to allow Vim to :set ft=mail automatically
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

            let file = services.get("directory").get("TmpD", Ci.nsIFile);
            file.append(tmpName);
            file.createUnique(Ci.nsIFile.NORMAL_FILE_TYPE, 0600);

            if (file.exists())
                return file;
            else
                return null; // XXX

        },

        /**
         * Returns the list of files in <b>dir</b>.
         *
         * @param {nsIFile|string} dir The directory to read, either a full
         *     pathname or an instance of nsIFile.
         * @param {boolean} sort Whether to sort the returned directory
         *     entries.
         * @returns {nsIFile[]}
         */
        readDirectory: function (dir, sort)
        {
            if (typeof dir == "string")
                dir = self.getFile(dir);
            else if (!(dir instanceof Ci.nsILocalFile))
                throw Cr.NS_ERROR_INVALID_ARG; // FIXME: does not work as expected, just shows undefined: undefined

            if (dir.isDirectory())
            {
                let entries = dir.directoryEntries;
                let array = [];
                while (entries.hasMoreElements())
                {
                    let entry = entries.getNext();
                    array.push(entry.QueryInterface(Ci.nsIFile));
                }
                if (sort)
                    array.sort(function (a, b) b.isDirectory() - a.isDirectory() ||  String.localeCompare(a.path, b.path));
                return array;
            }
            else
                return []; // XXX: or should it throw an error, probably yes?
                           //  Yes --djk
        },

        /**
         * Reads a file in "text" mode and returns the content as a string.
         *
         * @param {nsIFile|string} file The file to read, either a full
         *     pathname or an instance of nsIFile.
         * @returns {string}
         */
        readFile: function (file)
        {
            let ifstream = Cc["@mozilla.org/network/file-input-stream;1"].createInstance(Ci.nsIFileInputStream);
            let icstream = Cc["@mozilla.org/intl/converter-input-stream;1"].createInstance(Ci.nsIConverterInputStream);

            let toCharset = "UTF-8";
            if (typeof file == "string")
                file = self.getFile(file);
            else if (!(file instanceof Ci.nsILocalFile))
                throw Cr.NS_ERROR_INVALID_ARG; // FIXME: does not work as expected, just shows undefined: undefined

            ifstream.init(file, -1, 0, 0);
            icstream.init(ifstream, toCharset, 4096, Ci.nsIConverterInputStream.DEFAULT_REPLACEMENT_CHARACTER); // 4096 bytes buffering

            let buffer = "";
            let str = {};
            while (icstream.readString(4096, str) != 0)
                buffer += str.value;

            icstream.close();
            ifstream.close();

            return buffer;
        },

        /**
         * Writes the string <b>buf</b> to a file.
         *
         * @param {nsIFile|string} file The file to write, either a full
         *     pathname or an instance of nsIFile.
         * @param {string} buf The file content.
         * @param {string|number} mode The file access mode, a bitwise OR of
         *     the following flags:
         *       {@link #MODE_RDONLY}:   0x01
         *       {@link #MODE_WRONLY}:   0x02
         *       {@link #MODE_RDWR}:     0x04
         *       {@link #MODE_CREATE}:   0x08
         *       {@link #MODE_APPEND}:   0x10
         *       {@link #MODE_TRUNCATE}: 0x20
         *       {@link #MODE_SYNC}:     0x40
         *     Alternatively, the following abbreviations may be used:
         *       ">"  is equivalent to {@link #MODE_WRONLY} | {@link #MODE_CREATE} | {@link #MODE_TRUNCATE}
         *       ">>" is equivalent to {@link #MODE_WRONLY} | {@link #MODE_CREATE} | {@link #MODE_APPEND}
         * @default ">"
         * @param {number} perms The file mode bits of the created file. This
         *     is only used when creating a new file and does not change
         *     permissions if the file exists.
         * @default 0644
         */
        writeFile: function (file, buf, mode, perms)
        {
            let ofstream = Cc["@mozilla.org/network/file-output-stream;1"].createInstance(Ci.nsIFileOutputStream);
            let ocstream = Cc["@mozilla.org/intl/converter-output-stream;1"].createInstance(Ci.nsIConverterOutputStream);

            let charset = "UTF-8"; // Can be any character encoding name that Mozilla supports
            if (typeof file == "string")
                file = self.getFile(file);
            else if (!(file instanceof Ci.nsILocalFile))
                throw Cr.NS_ERROR_INVALID_ARG; // FIXME: does not work as expected, just shows undefined: undefined

            if (mode == ">>")
                mode = self.MODE_WRONLY | self.MODE_CREATE | self.MODE_APPEND;
            else if (!mode || mode == ">")
                mode = self.MODE_WRONLY | self.MODE_CREATE | self.MODE_TRUNCATE;

            if (!perms)
                perms = 0644;

            ofstream.init(file, mode, perms, 0);
            ocstream.init(ofstream, charset, 0, 0x0000);
            ocstream.writeString(buf);

            ocstream.close();
            ofstream.close();
        },

        /**
         * Runs an external program.
         *
         * @param {string} program The program to run.
         * @param {string[]} args An array of arguments to pass to <b>program</b>.
         * @param {boolean} blocking Whether to wait until the process terminates.
         */
        run: function (program, args, blocking)
        {
            args = args || [];
            blocking = !!blocking;

            let file;

            if (isAbsolutePath(program))
            {
                file = self.getFile(program, true);
            }
            else
            {
                let dirs = services.get("environment").get("PATH").split(WINDOWS ? ";" : ":");
                // Windows tries the CWD first TODO: desirable?
                if (WINDOWS)
                    dirs = [io.getCurrentDirectory().path].concat(dirs);

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
                            let extensions = services.get("environment").get("PATHEXT").split(";");
                            for (let [,extension] in Iterator(extensions))
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

            if (!file || !file.exists())
            {
                liberator.echoerr("Command not found: " + program);
                return -1;
            }

            let process = services.create("process");

            process.init(file);
            process.run(blocking, args, args.length);

            return process.exitValue;
        },

        // FIXME: multiple paths?
        /**
         * Sources files found in 'runtimepath'. For each relative path in
         * <b>paths</b> each directory in 'runtimepath' is searched and if a
         * matching file is found it is sourced. Only the first file found (per
         * specified path) is sourced unless <b>all</b> is specified, then
         * all found files are sourced.
         *
         * @param {string[]} paths An array of relative paths to source.
         * @param {boolean} all Whether all found files should be sourced.
         */
        sourceFromRuntimePath: function (paths, all)
        {
            let dirs = getPathsFromPathList(options["runtimepath"]);
            let found = false;

            // FIXME: should use original arg string
            liberator.echomsg("Searching for " + paths.join(" ").quote() + " in " + options["runtimepath"].quote(), 2);

            outer:
            for (let [,dir] in Iterator(dirs))
            {
                for (let [,path] in Iterator(paths))
                {
                    let file = joinPaths(dir, path);

                    liberator.echomsg("Searching for " + file.path.quote(), 3);

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
                liberator.echomsg("not found in 'runtimepath': " + paths.join(" ").quote(), 1); // FIXME: should use original arg string

            return found;
        },

        /**
         * Reads Ex commands, JavaScript or CSS from <b>filename</b>.
         *
         * @param {string} filename The name of the file to source.
         * @param {boolean} silent Whether errors should be reported.
         */
        source: function (filename, silent)
        {
            let wasSourcing = self.sourcing;
            try
            {
                var file = self.getFile(filename);
                self.sourcing = {
                    file: file.path,
                    line: 0
                };

                if (!file.exists() || !file.isReadable() || file.isDirectory())
                {
                    if (!silent)
                    {
                        if (file.exists() && file.isDirectory())
                            liberator.echomsg("Cannot source a directory: " + filename.quote(), 0);
                        else
                            liberator.echomsg("could not source: " + filename.quote(), 1);

                        liberator.echoerr("E484: Can't open file " + filename);
                    }

                    return;
                }

                liberator.echomsg("sourcing " + filename.quote(), 2);

                let str = self.readFile(file);
                let uri = ioService.newFileURI(file);

                // handle pure JavaScript files specially
                if (/\.js$/.test(filename))
                {
                    try
                    {
                        liberator.loadScript(uri.spec, new Script(file));
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
                    storage.styles.registerSheet(uri.spec, true);
                }
                else
                {
                    let heredoc = "";
                    let heredocEnd = null; // the string which ends the heredoc
                    let lines = str.split(/\r\n|[\r\n]/);

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
                            self.sourcing.line = i + 1;
                            // skip line comments and blank lines
                            line = line.replace(/\r$/, "");

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
                                liberator.echoerr("Error detected while processing " + file.path, commandline.FORCE_MULTILINE);
                                commandline.echo("line " + lineNumber + ":", commandline.HL_LINENR, commandline.APPEND_TO_MESSAGES);
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
                                        heredocEnd = RegExp("^" + matches[2] + "$", "m");
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
                                    liberator.execute(line, null, true);
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

                liberator.echomsg("finished sourcing " + filename.quote(), 2);

                liberator.log("Sourced: " + filename, 3);
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
                self.sourcing = wasSourcing;
            }
        },

        // TODO: when https://bugzilla.mozilla.org/show_bug.cgi?id=68702 is
        // fixed is fixed, should use that instead of a tmpfile
        /**
         * Runs <b>command</b> in a subshell and returns the output in a
         * string. The shell used is that specified by the 'shell' option.
         *
         * @param {string} command The command to run.
         * @param {string} input Any input to be provided to the command on stdin.
         * @returns {string}
         */
        system: function (command, input)
        {
            liberator.echomsg("Calling shell to execute: " + command, 4);

            function escape(str) '"' + str.replace(/[\\"$]/g, "\\$&") + '"';

            return this.withTempFiles(function (stdin, stdout, cmd) {
                if (input)
                    this.writeFile(stdin, input);

                // TODO: implement 'shellredir'
                if (WINDOWS)
                {
                    command = "cd /D " + cwd.path + " && " + command + " > " + stdout.path + " 2>&1" + " < " + stdin.path;
                    var res = this.run(options["shell"], options["shellcmdflag"].split(/\s+/).concat(command), true);
                }
                else
                {
                    this.writeFile(cmd, "cd " + escape(cwd.path) + "\n" +
                            ["exec", ">" + escape(stdout.path), "2>&1", "<" + escape(stdin.path),
                             escape(options["shell"]), options["shellcmdflag"], escape(command)].join(" "));
                    res = this.run("/bin/sh", ["-e", cmd.path], true);
                }

                let output = self.readFile(stdout);
                if (res > 0)
                    output += "\nshell returned " + res;
                // if there is only one \n at the end, chop it off
                else if (output && output.indexOf("\n") == output.length - 1)
                    output = output.substr(0, output.length - 1);

                return output;
            }) || "";
        },

        /**
         * Creates a temporary file context for executing external commands.
         * <b>fn</b> is called with a temp file, created with
         * {@link #createTempFile}, for each explicit argument. Ensures that
         * all files are removed when <b>fn</b> returns.
         *
         * @param {function} fn The function to execute.
         * @param {Object} self The 'this' object used when executing fn.
         * @return {boolean} false if temp files couldn't be created,
         *     otherwise, the return value of <b>fn</b>.
         */
        withTempFiles: function (fn, self)
        {
            let args = util.map(util.range(0, fn.length), this.createTempFile);
            if (!args.every(util.identity))
                return false;

            try
            {
                return fn.apply(self || this, args);
            }
            finally
            {
                args.forEach(function (f) f.remove(false));
            }
        }
    }; //}}}

    return self;

}; //}}}

/**
 * @property {string} The value of the $VIMPERATOR_RUNTIME environment
 *     variable.
 */
IO.__defineGetter__("runtimePath", function () {
    const rtpvar = config.name.toUpperCase() + "_RUNTIME";
    let rtp = services.get("environment").get(rtpvar);
    if (!rtp)
    {
        rtp = "~/" + (liberator.has("Win32") ? "" : ".") + config.name.toLowerCase();
        services.get("environment").set(rtpvar, rtp);
    }
    return rtp;
});

IO.expandPath = function (path, relative)
{
    // TODO: proper pathname separator translation like Vim - this should be done elsewhere
    const WINDOWS = liberator.has("Win32");
    if (WINDOWS)
        path = path.replace("/", "\\", "g");

    // expand any $ENV vars - this is naive but so is Vim and we like to be compatible
    // TODO: Vim does not expand variables set to an empty string (and documents it).
    // Kris reckons we shouldn't replicate this 'bug'. --djk
    // TODO: should we be doing this for all paths?
    function expand(path) path.replace(
        !WINDOWS ? /\$(\w+)\b|\${(\w+)}/g
                 : /\$(\w+)\b|\${(\w+)}|%(\w+)%/g,
        function (m, n1, n2, n3) services.get("environment").get(n1 || n2 || n3) || m
    );
    path = expand(path);

    // expand ~
    if (!relative && (WINDOWS ? /^~(?:$|[\\\/])/ : /^~(?:$|\/)/).test(path))
    {
        // Try $HOME first, on all systems
        let home = services.get("environment").get("HOME");

        // Windows has its own idiosyncratic $HOME variables.
        if (!home && WINDOWS)
            home = services.get("environment").get("USERPROFILE") ||
                   services.get("environment").get("HOMEDRIVE") + services.get("environment").get("HOMEPATH");

        path = home + path.substr(1);
    }

    // TODO: Vim expands paths twice, once before checking for ~, once
    // after, but doesn't document it. Is this just a bug? --Kris
    path = expand(path);

    if (WINDOWS)
        path = path.replace("/", "\\", "g");

    return path;
};

// vim: set fdm=marker sw=4 ts=4 et:

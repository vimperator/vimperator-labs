// Copyright (c) 2006-2009 by Martin Stubenschrott <stubenschrott@vimperator.org>
// Some code based on Venkman
//
// This work is licensed for reuse under an MIT license. Details are
// given in the License.txt file included with this file.


/** @scope modules */

plugins.contexts = {};
const Script = Class("Script", {
    init: function (file) {
        let self = plugins.contexts[file.path];
        if (self) {
            if (self.onUnload)
                self.onUnload();
            return self;
        }
        plugins.contexts[file.path] = this;
        this.NAME = file.leafName.replace(/\..*/, "").replace(/-([a-z])/g, function (m, n1) n1.toUpperCase());
        this.PATH = file.path;
        this.toString = this.toString;
        this.__context__ = this;
        this.__proto__ = plugins;

        // This belongs elsewhere
        for (let [, dir] in Iterator(io.getRuntimeDirectories("plugin"))) {
            if (dir.contains(file, false))
                plugins[this.NAME] = this;
        }
        return this;
    }
});

/**
 * @class File A class to wrap nsIFile objects and simplify operations
 * thereon.
 *
 * @param {nsIFile|string} path Expanded according to {@link IO#expandPath}
 * @param {boolean} checkPWD Whether to allow expansion relative to the
 *          current directory. @default true
 */
const File = Class("File", {
    init: function (path, checkPWD) {
        if (arguments.length < 2)
            checkPWD = true;

        let file = services.create("file");

        if (path instanceof Ci.nsIFile)
            file = path;
        else if (/file:\/\//.test(path))
            file = services.create("file:").getFileFromURLSpec(path);
        else {
            let expandedPath = File.expandPath(path);

            if (!File.isAbsolutePath(expandedPath) && checkPWD)
                file = File.joinPaths(io.getCurrentDirectory().path, expandedPath);
            else
                file.initWithPath(expandedPath);
        }
        let self = XPCNativeWrapper(file);
        self.__proto__ = File.prototype;
        return self;
    },

    /**
     * Iterates over the objects in this directory.
     */
    iterDirectory: function () {
        if (!this.isDirectory())
            throw Error("Not a directory");
        let entries = this.directoryEntries;
        while (entries.hasMoreElements())
            yield File(entries.getNext().QueryInterface(Ci.nsIFile));
    },
    /**
     * Returns the list of files in this directory.
     *
     * @param {boolean} sort Whether to sort the returned directory
     *     entries.
     * @returns {nsIFile[]}
     */
    readDirectory: function (sort) {
        if (!this.isDirectory())
            throw Error("Not a directory");

        let array = [e for (e in this.iterDirectory())];
        if (sort)
            array.sort(function (a, b) b.isDirectory() - a.isDirectory() ||  String.localeCompare(a.path, b.path));
        return array;
    },

    /**
     * Reads this file's entire contents in "text" mode and returns the
     * content as a string.
     *
     * @param {string} encoding The encoding from which to decode the file.
     *          @default options["fileencoding"]
     * @returns {string}
     */
    read: function (encoding) {
        let ifstream = Cc["@mozilla.org/network/file-input-stream;1"].createInstance(Ci.nsIFileInputStream);
        let icstream = Cc["@mozilla.org/intl/converter-input-stream;1"].createInstance(Ci.nsIConverterInputStream);

        if (!encoding)
            encoding = options["fileencoding"];

        ifstream.init(this, -1, 0, 0);
        icstream.init(ifstream, encoding, 4096, Ci.nsIConverterInputStream.DEFAULT_REPLACEMENT_CHARACTER); // 4096 bytes buffering

        let buffer = [];
        let str = {};
        while (icstream.readString(4096, str) != 0)
            buffer.push(str.value);

        icstream.close();
        ifstream.close();
        return buffer.join("");
    },

    /**
     * Writes the string <b>buf</b> to this file.
     *
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
     * @param {string} encoding The encoding to used to write the file.
     * @default options["fileencoding"]
     */
    write: function (buf, mode, perms, encoding) {
        let ofstream = Cc["@mozilla.org/network/file-output-stream;1"].createInstance(Ci.nsIFileOutputStream);
        function getStream(defaultChar) {
            let stream = Cc["@mozilla.org/intl/converter-output-stream;1"].createInstance(Ci.nsIConverterOutputStream);
            stream.init(ofstream, encoding, 0, defaultChar);
            return stream;
        }

        if (!encoding)
            encoding = options["fileencoding"];

        if (mode == ">>")
            mode = File.MODE_WRONLY | File.MODE_CREATE | File.MODE_APPEND;
        else if (!mode || mode == ">")
            mode = File.MODE_WRONLY | File.MODE_CREATE | File.MODE_TRUNCATE;

        if (!perms)
            perms = 0644;

        ofstream.init(this, mode, perms, 0);
        let ocstream = getStream(0);
        try {
            ocstream.writeString(buf);
        }
        catch (e) {
            // liberator.log(e);
            if (e.result == Cr.NS_ERROR_LOSS_OF_SIGNIFICANT_DATA) {
                ocstream = getStream("?".charCodeAt(0));
                ocstream.writeString(buf);
                return false;
            }
            else
                throw e;
        }
        finally {
            try {
                ocstream.close();
            }
            catch (e) {}
            ofstream.close();
        }
        return true;
    }
}, {
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

    expandPathList: function (list) list.split(",").map(this.expandPath).join(","),

    expandPath: function (path, relative) {

        // expand any $ENV vars - this is naive but so is Vim and we like to be compatible
        // TODO: Vim does not expand variables set to an empty string (and documents it).
        // Kris reckons we shouldn't replicate this 'bug'. --djk
        // TODO: should we be doing this for all paths?
        function expand(path) path.replace(
            !liberator.has("Windows") ? /\$(\w+)\b|\${(\w+)}/g
                                 : /\$(\w+)\b|\${(\w+)}|%(\w+)%/g,
            function (m, n1, n2, n3) services.get("environment").get(n1 || n2 || n3) || m
        );
        path = expand(path);

        // expand ~
        // Yuck.
        if (!relative && RegExp("~(?:$|[/" + util.escapeRegex(IO.PATH_SEP) + "])").test(path)) {
            // Try $HOME first, on all systems
            let home = services.get("environment").get("HOME");

            // Windows has its own idiosyncratic $HOME variables.
            if (!home && liberator.has("Windows"))
                home = services.get("environment").get("USERPROFILE") ||
                       services.get("environment").get("HOMEDRIVE") + services.get("environment").get("HOMEPATH");

            path = home + path.substr(1);
        }

        // TODO: Vim expands paths twice, once before checking for ~, once
        // after, but doesn't document it. Is this just a bug? --Kris
        path = expand(path);
        return path.replace("/", IO.PATH_SEP, "g");
    },

    getPathsFromPathList: function (list) {
        if (!list)
            return [];
        // empty list item means the current directory
        return list.replace(/,$/, "").split(",")
                   .map(function (dir) dir == "" ? io.getCurrentDirectory().path : dir);
    },

    replacePathSep: function (path) path.replace("/", IO.PATH_SEP, "g"),

    joinPaths: function (head, tail) {
        let path = this(head);
        try {
            path.appendRelativePath(this.expandPath(tail, true)); // FIXME: should only expand env vars and normalise path separators
            // TODO: This code breaks the external editor at least in ubuntu
            // because /usr/bin/gvim becomes /usr/bin/vim.gnome normalized and for
            // some strange reason it will start without a gui then (which is not
            // optimal if you don't start firefox from a terminal ;)
            // Why do we need this code?
            // if (path.exists() && path.normalize)
            //    path.normalize();
        }
        catch (e) {
            return { exists: function () false, __noSuchMethod__: function () { throw e; } };
        }
        return path;
    },

    isAbsolutePath: function (path) {
        try {
            services.create("file").initWithPath(path);
            return true;
        }
        catch (e) {
            return false;
        }
    }
});

// TODO: why are we passing around strings rather than file objects?
/**
 * Provides a basic interface to common system I/O operations.
 * @instance io
 */
const IO = Module("io", {
    requires: ["config", "services"],

    init: function () {
        this._processDir = services.get("directory").get("CurWorkD", Ci.nsIFile);
        this._cwd = this._processDir;
        this._oldcwd = null;

        this._lastRunCommand = ""; // updated whenever the users runs a command with :!
        this._scriptNames = [];

        this.downloadListener = {
            onDownloadStateChange: function (state, download) {
                if (download.state == services.get("downloadManager").DOWNLOAD_FINISHED) {
                    let url   = download.source.spec;
                    let title = download.displayName;
                    let file  = download.targetFile.path;
                    let size  = download.size;

                    liberator.echomsg("Download of " + title + " to " + file + " finished");
                    autocommands.trigger("DownloadPost", { url: url, title: title, file: file, size: size });
                }
            },
            onStateChange:    function () {},
            onProgressChange: function () {},
            onSecurityChange: function () {}
        };

        services.add("UUID",  "@mozilla.org/uuid-generator;1", Ci.nsIUUIDGenerator);

        services.get("downloadManager").addListener(this.downloadListener);
    },

    destroy: function () {
        services.get("downloadManager").removeListener(this.downloadListener);
        for (let [, plugin] in Iterator(plugins.contexts))
            if (plugin.onUnload)
                plugin.onUnload();
    },

    /**
     * @property {function} File class.
     * @final
     */
    File: File,

    /**
     * @property {Object} The current file sourcing context. As a file is
     *     being sourced the 'file' and 'line' properties of this context
     *     object are updated appropriately.
     */
    sourcing: null,

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
    expandPath: File.expandPath,

    // TODO: there seems to be no way, short of a new component, to change
    // the process's CWD - see https://bugzilla.mozilla.org/show_bug.cgi?id=280953
    /**
     * Returns the current working directory.
     *
     * It's not possible to change the real CWD of the process so this
     * state is maintained internally. External commands run via
     * {@link #system} are executed in this directory.
     *
     * @returns {nsIFile}
     */
    getCurrentDirectory: function () {
        let dir = File(this._cwd.path);

        // NOTE: the directory could have been deleted underneath us so
        // fallback to the process's CWD
        if (dir.exists() && dir.isDirectory())
            return dir;
        else
            return this._processDir;
    },

    /**
     * Sets the current working directory.
     *
     * @param {string} newDir The new CWD. This may be a relative or
     *     absolute path and is expanded by {@link #expandPath}.
     */
    setCurrentDirectory: function (newDir) {
        newDir = newDir || "~";

        if (newDir == "-") {
            [this._cwd, this._oldcwd] = [this._oldcwd, this.getCurrentDirectory()];
        } else {
            let dir = File(newDir);

            if (!dir.exists() || !dir.isDirectory()) {
                liberator.echoerr("Directory does not exist: " + dir.path);
                return null;
            }

            dir.normalize();
            [this._cwd, this._oldcwd] = [dir, this.getCurrentDirectory()];
        }

        return this.getCurrentDirectory();
    },

    /**
     * Returns all directories named <b>name<b/> in 'runtimepath'.
     *
     * @param {string} name
     * @returns {nsIFile[])
     */
    getRuntimeDirectories: function (name) {
        let dirs = File.getPathsFromPathList(options["runtimepath"]);

        dirs = dirs.map(function (dir) File.joinPaths(dir, name))
                   .filter(function (dir) dir.exists() && dir.isDirectory() && dir.isReadable());
        return dirs;
    },

    /**
     * Returns the first user RC file found in <b>dir</b>.
     *
     * @param {string} dir The directory to search.
     * @param {boolean} always When true, return a path whether
     *     the file exists or not.
     * @default $HOME.
     * @returns {nsIFile} The RC file or null if none is found.
     */
    getRCFile: function (dir, always) {
        dir = dir || "~";

        let rcFile1 = File.joinPaths(dir, "." + config.name.toLowerCase() + "rc");
        let rcFile2 = File.joinPaths(dir, "_" + config.name.toLowerCase() + "rc");

        if (liberator.has("Windows"))
            [rcFile1, rcFile2] = [rcFile2, rcFile1];

        if (rcFile1.exists() && rcFile1.isFile())
            return rcFile1;
        else if (rcFile2.exists() && rcFile2.isFile())
            return rcFile2;
        else if (always)
            return rcFile1;
        return null;
    },

    // TODO: make secure
    /**
     * Creates a temporary file.
     *
     * @returns {File}
     */
    createTempFile: function () {
        let file = services.get("directory").get("TmpD", Ci.nsIFile);

        file.append(config.tempFile);
        file.createUnique(Ci.nsIFile.NORMAL_FILE_TYPE, 0600);

        return File(file);
    },

    /**
     * Runs an external program.
     *
     * @param {string} program The program to run.
     * @param {string[]} args An array of arguments to pass to <b>program</b>.
     * @param {boolean} blocking Whether to wait until the process terminates.
     */
    blockingProcesses: [],
    run: function (program, args, blocking) {
        args = args || [];
        blocking = !!blocking;

        let file;

        if (File.isAbsolutePath(program))
            file = File(program, true);
        else {
            let dirs = services.get("environment").get("PATH").split(liberator.has("Windows") ? ";" : ":");
            // Windows tries the CWD first TODO: desirable?
            if (liberator.has("Windows"))
                dirs = [io.getCurrentDirectory().path].concat(dirs);

lookup:
            for (let [, dir] in Iterator(dirs)) {
                file = File.joinPaths(dir, program);
                try {
                    if (file.exists())
                        break;

                    // TODO: couldn't we just palm this off to the start command?
                    // automatically try to add the executable path extensions on windows
                    if (liberator.has("Windows")) {
                        let extensions = services.get("environment").get("PATHEXT").split(";");
                        for (let [, extension] in Iterator(extensions)) {
                            file = File.joinPaths(dir, program + extension);
                            if (file.exists())
                                break lookup;
                        }
                    }
                }
                catch (e) {}
            }
        }

        if (!file || !file.exists()) {
            liberator.callInMainThread(function() {
                if (services.get("threadManager").isMainThread) // does not really seem to work but at least doesn't crash Firefox
                    liberator.echoerr("Command not found: " + program);
            }, this);
            return -1;
        }

        let process = services.create("process");

        process.init(file);
        process.run(false, args.map(String), args.length);
        try {
            if (blocking)
                while (process.isRunning)
                    liberator.threadYield(false, true);
        }
        catch (e) {
            process.kill();
            throw e;
        }

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
    sourceFromRuntimePath: function (paths, all) {
        let dirs = File.getPathsFromPathList(options["runtimepath"]);
        let found = false;

        liberator.log("Searching for \"" + paths.join(" ") + "\" in \"" + options["runtimepath"] + "\"");

        outer:
        for (let [, dir] in Iterator(dirs)) {
            for (let [, path] in Iterator(paths)) {
                let file = File.joinPaths(dir, path);

                if (file.exists() && file.isFile() && file.isReadable()) {
                    io.source(file.path, false);
                    found = true;

                    if (!all)
                        break outer;
                }
            }
        }

        if (!found)
            liberator.log("not found in 'runtimepath': \"" + paths.join(" ") + "\"");

        return found;
    },

    /**
     * Reads Ex commands, JavaScript or CSS from <b>filename</b>.
     *
     * @param {string} filename The name of the file to source.
     * @param {boolean} silent Whether errors should be reported.
     */
    source: function (filename, silent) {
        let wasSourcing = this.sourcing;
        try {
            var file = File(filename);
            this.sourcing = {
                file: file.path,
                line: 0
            };

            if (!file.exists() || !file.isReadable() || file.isDirectory()) {
                if (!silent) {
                    if (file.exists() && file.isDirectory())
                        liberator.echomsg("Cannot source a directory: " + filename);
                    else
                        liberator.echomsg("Could not source: " + filename);

                    liberator.echoerr("Cannot open file: " + filename);
                }

                return;
            }

            // liberator.echomsg("Sourcing \"" + filename + "\" ...");

            let str = file.read();
            let uri = services.get("io").newFileURI(file);

            // handle pure JavaScript files specially
            if (/\.js$/.test(filename)) {
                try {
                    // Workaround for SubscriptLoader caching.
                    let suffix = '?' + encodeURIComponent(services.get("UUID").generateUUID().toString());
                    liberator.loadScript(uri.spec + suffix, Script(file));
                    if (liberator.initialized)
                        liberator.initHelp();
                }
                catch (e) {
                    let err = new Error();
                    for (let [k, v] in Iterator(e))
                        err[k] = v;
                    err.echoerr = <>{file.path}:{e.lineNumber}: {e}</>;
                    throw err;
                }
            }
            else if (/\.css$/.test(filename))
                storage.styles.registerSheet(uri.spec, false, true);
            else {
                let heredoc = "";
                let heredocEnd = null; // the string which ends the heredoc
                let lines = str.split(/\r\n|[\r\n]/);

                function execute(args) { command.execute(args, special, count, { setFrom: file }); }

                for (let [i, line] in Iterator(lines)) {
                    if (heredocEnd) { // we already are in a heredoc
                        if (heredocEnd.test(line)) {
                            execute(heredoc);
                            heredoc = "";
                            heredocEnd = null;
                        }
                        else
                            heredoc += line + "\n";
                    }
                    else {
                        this.sourcing.line = i + 1;
                        // skip line comments and blank lines
                        line = line.replace(/\r$/, "");

                        if (/^\s*(".*)?$/.test(line))
                            continue;

                        var [count, cmd, special, args] = commands.parseCommand(line);
                        var command = commands.get(cmd);

                        if (!command) {
                            let lineNumber = i + 1;

                            liberator.echoerr("Error detected while processing: " + file.path, commandline.FORCE_MULTILINE);
                            commandline.echo("line " + lineNumber + ":", commandline.HL_LINENR, commandline.APPEND_TO_MESSAGES);
                            liberator.echoerr("Not an editor command: " + line);
                        }
                        else {
                            if (command.name == "finish")
                                break;
                            else if (command.hereDoc) {
                                // check for a heredoc
                                let matches = args.match(/(.*)<<\s*(\S+)$/);

                                if (matches) {
                                    args = matches[1];
                                    heredocEnd = RegExp("^" + matches[2] + "$", "m");
                                    if (matches[1])
                                        heredoc = matches[1] + "\n";
                                    continue;
                                }
                            }

                            execute(args);
                        }
                    }
                }

                // if no heredoc-end delimiter is found before EOF then
                // process the heredoc anyway - Vim compatible ;-)
                if (heredocEnd)
                    execute(heredoc);
            }

            if (this._scriptNames.indexOf(file.path) == -1)
                this._scriptNames.push(file.path);

            liberator.log("Sourced: " + filename);
        }
        catch (e) {
            liberator.echoerr(e, null, "Sourcing file failed: ");
        }
        finally {
            this.sourcing = wasSourcing;
        }
    },

    // TODO: when https://bugzilla.mozilla.org/show_bug.cgi?id=68702 is
    // fixed use that instead of a tmpfile
    /**
     * Runs <b>command</b> in a subshell and returns the output in a
     * string. The shell used is that specified by the 'shell' option.
     *
     * @param {string} command The command to run.
     * @param {string} input Any input to be provided to the command on stdin.
     * @returns {string}
     */
    system: function (command, input) {
        liberator.echomsg("Executing: " + command);

        function escape(str) '"' + str.replace(/[\\"$]/g, "\\$&") + '"';

        return this.withTempFiles(function (stdin, stdout, cmd) {
            if (input)
                stdin.write(input);

            // TODO: implement 'shellredir'
            if (liberator.has("Windows")) {
                if (options["shell"] == "cmd.exe") {
                    command = "cd /D " + this._cwd.path + " && " + command + " > " + stdout.path + " 2>&1" + " < " + stdin.path;
                } else {
                    // in this case, assume the shell is unix-like
                    command = "cd " + escape(this._cwd.path) + " && " + command + " > " + escape(stdout.path) + " 2>&1" + " < " + escape(stdin.path);
                }
                var res = this.run(options["shell"], options["shellcmdflag"].split(/\s+/).concat(command), true);
            }
            else {
                cmd.write("cd " + escape(this._cwd.path) + "\n" +
                        ["exec", ">" + escape(stdout.path), "2>&1", "<" + escape(stdin.path),
                         escape(options["shell"]), options["shellcmdflag"], escape(command)].join(" "));
                res = this.run("/bin/sh", ["-e", cmd.path], true);
            }

            let output = stdout.read();
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
     * <b>func</b> is called with a temp file, created with
     * {@link #createTempFile}, for each explicit argument. Ensures that
     * all files are removed when <b>func</b> returns.
     *
     * @param {function} func The function to execute.
     * @param {Object} self The 'this' object used when executing func.
     * @returns {boolean} false if temp files couldn't be created,
     *     otherwise, the return value of <b>func</b>.
     */
    withTempFiles: function (func, self) {
        let args = util.map(util.range(0, func.length), this.createTempFile);
        if (!args.every(util.identity))
            return false;

        try {
            return func.apply(self || this, args);
        }
        finally {
            args.forEach(function (f) f.remove(false));
        }
    }
}, {
    /**
     * @property {string} The value of the $VIMPERATOR_RUNTIME environment
     *     variable.
     */
    get runtimePath() {
        const rtpvar = config.name.toUpperCase() + "_RUNTIME";
        let rtp = services.get("environment").get(rtpvar);
        if (!rtp) {
            rtp = "~/" + (liberator.has("Windows") ? "" : ".") + config.name.toLowerCase();
            services.get("environment").set(rtpvar, rtp);
        }
        return rtp;
    },

    /**
     * @property {string} The current platform's path seperator.
     */
    get PATH_SEP() {
        delete this.PATH_SEP;
        let f = services.get("directory").get("CurProcD", Ci.nsIFile);
        f.append("foo");
        return this.PATH_SEP = f.path.substr(f.parent.path.length, 1);
    }
}, {
    commands: function () {
        commands.add(["cd", "chd[ir]"],
            "Change the current directory",
            function (args) {
                let arg = args.literalArg;

                if (!arg) {
                    arg = "~";
                } else if (arg == "-") {
                    liberator.assert(io._oldcwd, "No previous directory");
                    arg = io._oldcwd.path;
                }

                arg = File.expandPath(arg);

                // go directly to an absolute path or look for a relative path
                // match in 'cdpath'
                if (File.isAbsolutePath(arg)) {
                    if (io.setCurrentDirectory(arg))
                        liberator.echomsg(io.getCurrentDirectory().path);
                } else {
                    let dirs = File.getPathsFromPathList(options["cdpath"]);
                    let found = false;

                    for (let [, dir] in Iterator(dirs)) {
                        dir = File.joinPaths(dir, arg);

                        if (dir.exists() && dir.isDirectory() && dir.isReadable()) {
                            io.setCurrentDirectory(dir.path);
                            liberator.echomsg(io.getCurrentDirectory().path);
                            found = true;
                            break;
                        }
                    }

                    if (!found)
                        liberator.echoerr("Can't find directory " + arg.quote() + " in cdpath\n" + "Command failed");
                }
            }, {
                argCount: "?",
                completer: function (context) completion.directory(context, true),
                literal: 0
            });

        // NOTE: this command is only used in :source
        commands.add(["fini[sh]"],
            "Stop sourcing a script file",
            function () { liberator.echoerr(":finish used outside of a sourced file"); },
            { argCount: "0" });

        commands.add(["pw[d]"],
            "Print the current directory name",
            function () { liberator.echomsg(io.getCurrentDirectory().path); },
            { argCount: "0" });

        // "mkv[imperatorrc]" or "mkm[uttatorrc]"
        commands.add([config.name.toLowerCase().replace(/(.)(.*)/, "mk$1[$2rc]")],
            "Write current key mappings and changed options to the config file",
            function (args) {
                liberator.assert(args.length <= 1, "Only one file name allowed");

                let filename = args[0] || io.getRCFile(null, true).path;
                let file = File(filename);

                liberator.assert(!file.exists() || args.bang,
                    "File exists: " + filename + ". Add ! to override.");

                // TODO: Use a set/specifiable list here:
                let lines = [cmd.serial().map(commands.commandToString) for (cmd in commands) if (cmd.serial)];
                lines = util.Array.flatten(lines);

                // source a user .vimperatorrc file
                lines.unshift('"' + liberator.version + "\n");

                // For the record, I think that adding this line is absurd. --Kris
                // I can't disagree. --djk
                lines.push(commands.commandToString({
                    command: "source",
                    bang: true,
                    arguments: [filename + ".local"]
                }));

                lines.push("\n\" vim: set ft=" + config.name.toLowerCase() + ":");

                try {
                    file.write(lines.join("\n"));
                }
                catch (e) {
                    liberator.echoerr("Could not write to " + file.path + ": " + e.message);
                }
            }, {
                argCount: "*", // FIXME: should be "?" but kludged for proper error message
                bang: true,
                completer: function (context) completion.file(context, true)
            });

        commands.add(["runt[ime]"],
            "Source the specified file from each directory in 'runtimepath'",
            function (args) { io.sourceFromRuntimePath(args, args.bang); }, {
                argCount: "+",
                bang: true
            }
        );

        commands.add(["scrip[tnames]"],
            "List all sourced script names",
            function () {
                let list = template.tabular([{ header: "<SNR>", style: "text-align: right; padding-right: 1em;" }, "Filename"], 
                    ([i + 1, file] for ([i, file] in Iterator(io._scriptNames))));

                commandline.echo(list, commandline.HL_NORMAL, commandline.FORCE_MULTILINE);
            },
            { argCount: "0" });

        commands.add(["so[urce]"],
            "Read Ex commands from a file",
            function (args) {
                io.source(args.literalArg, args.bang);
            }, {
                literal: 0,
                bang: true,
                completer: function (context) completion.file(context, true)
            });

        commands.add(["!", "run"],
            "Run a command",
            function (args) {
                let arg = args.literalArg;

                // :!! needs to be treated specially as the command parser sets the
                // bang flag but removes the ! from arg
                if (args.bang)
                    arg = "!" + arg;

                // replaceable bang and no previous command?
                liberator.assert(!/((^|[^\\])(\\\\)*)!/.test(arg) || io._lastRunCommand, "No previous command");

                // NOTE: Vim doesn't replace ! preceded by 2 or more backslashes and documents it - desirable?
                // pass through a raw bang when escaped or substitute the last command
                arg = arg.replace(/(\\)*!/g,
                    function (m) /^\\(\\\\)*!$/.test(m) ? m.replace("\\!", "!") : m.replace("!", io._lastRunCommand)
                );

                io._lastRunCommand = arg;

                let output = io.system(arg);

                commandline.command = "!" + arg;
                commandline.echo(template.genericOutput("Command Output: " + arg, <span highlight="CmdOutput">{output}</span>));

                autocommands.trigger("ShellCmdPost", {});
            }, {
                argCount: "?",
                bang: true,
                completer: function (context) completion.shellCommand(context),
                literal: 0
            });
    },
    completion: function () {
        JavaScript.setCompleter([this.File, File.expandPath],
            [function (context, obj, args) {
                context.quote[2] = "";
                completion.file(context, true);
            }]);

        completion.charset = function (context) {
            context.anchored = false;
            context.generate = function () {
                let names = util.Array(
                    "more1 more2 more3 more4 more5 unicode".split(" ").map(function (key)
                        options.getPref("intl.charsetmenu.browser." + key).split(', '))
                ).flatten().uniq();
                let bundle = document.getElementById("liberator-charset-bundle");
                return names.map(function (name) [name, bundle.getString(name.toLowerCase() + ".title")]);
            };
        };

        completion.directory = function directory(context, full) {
            this.file(context, full);
            context.filters.push(function ({ item: f }) f.isDirectory());
        };

        completion.environment = function environment(context) {
            let command = liberator.has("Windows") ? "set" : "env";
            let lines = io.system(command).split("\n");
            lines.pop();

            context.title = ["Environment Variable", "Value"];
            context.generate = function () lines.map(function (line) (line.match(/([^=]+)=(.+)/) || []).slice(1));
        };

        // TODO: support file:// and \ or / path separators on both platforms
        // if "tail" is true, only return names without any directory components
        completion.file = function file(context, full) {
            // dir == "" is expanded inside readDirectory to the current dir
            let [dir] = context.filter.match(/^(?:.*[\/\\])?/);

            if (!full)
                context.advance(dir.length);

            context.title = [full ? "Path" : "Filename", "Type"];
            context.keys = {
                text: !full ? "leafName" : function (f) dir + f.leafName,
                description: function (f) f.isDirectory() ? "Directory" : "File",
                isdir: function (f) f.isDirectory(),
                icon: function (f) f.isDirectory() ? "resource://gre/res/html/folder.png"
                                                             : "moz-icon://" + f.leafName
            };
            context.compare = function (a, b)
                        b.isdir - a.isdir || String.localeCompare(a.text, b.text);

            context.match = function (str) {
                let filter = this.filter;
                if (!filter)
                    return true;

                if (this.ignoreCase) {
                    filter = filter.toLowerCase();
                    str = str.toLowerCase();
                }
                return str.substr(0, filter.length) === filter;
            };

            // context.background = true;
            context.key = dir;
            context.generate = function generate_file() {
                try {
                    return File(dir).readDirectory();
                }
                catch (e) {}
                return [];
            };
        };

        completion.shellCommand = function shellCommand(context) {
            context.title = ["Shell Command", "Path"];
            context.generate = function () {
                let dirNames = services.get("environment").get("PATH").split(RegExp(liberator.has("Windows") ? ";" : ":"));
                let commands = [];

                for (let [, dirName] in Iterator(dirNames)) {
                    let dir = io.File(dirName);
                    if (dir.exists() && dir.isDirectory()) {
                        commands.push([[file.leafName, dir.path] for (file in dir.iterDirectory())
                                            if (file.isFile() && file.isExecutable())]);
                    }
                }

                return util.Array.flatten(commands);
            };
        };

        completion.addUrlCompleter("f", "Local files", completion.file);
    },
    options: function () {
        var shell, shellcmdflag;
        if (liberator.has("Windows")) {
            shell = "cmd.exe";
            // TODO: setting 'shell' to "something containing sh" updates
            // 'shellcmdflag' appropriately at startup on Windows in Vim
            shellcmdflag = "/c";
        }
        else {
            shell = services.get("environment").get("SHELL") || "sh";
            shellcmdflag = "-c";
        }

        options.add(["fileencoding", "fenc"],
            "Sets the character encoding of read and written files",
            "string", "UTF-8", {
                completer: function (context) completion.charset(context)
            });
        options.add(["cdpath", "cd"],
            "List of directories searched when executing :cd",
            "stringlist", "," + (services.get("environment").get("CDPATH").replace(/[:;]/g, ",") || ","),
            { setter: function (value) File.expandPathList(value) });

        options.add(["runtimepath", "rtp"],
            "List of directories searched for runtime files",
            "stringlist", IO.runtimePath,
            { setter: function (value) File.expandPathList(value) });

        options.add(["shell", "sh"],
            "Shell to use for executing :! and :run commands",
            "string", shell,
            { setter: function (value) File.expandPath(value) });

        options.add(["shellcmdflag", "shcf"],
            "Flag passed to shell when executing :! and :run commands",
            "string", shellcmdflag);
    }
});

// vim: set fdm=marker sw=4 ts=4 et:

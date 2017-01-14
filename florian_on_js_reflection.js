// This is an xpcshell script written by Florian Quèze [1] for the Bug 1330464 [2].
// This script live parses and modifies JS files to detect and revise calls to Services.foo.bar() with wrong arg numbers.
// In this script, it made a good example of using the OS file APIs and SpiderMonkey Reflection Parser APIs.
// [1] Florian Quèze: florian@queze.net
// [2] https://bugzilla.mozilla.org/show_bug.cgi?id=1330464

var { classes: Cc, interfaces: Ci, utils: Cu, results: Cr } = Components;

Components.utils.import("resource://gre/modules/osfile.jsm");
Components.utils.import("resource://gre/modules/Task.jsm");
Components.utils.import("resource://gre/modules/Services.jsm");

const init = Components.classes["@mozilla.org/jsreflect;1"].createInstance();
init();

var done = false;

const kIgnorePaths = [
  "obj-browser", "obj-browser-dbg", "objdir-artifact",
  ".hg",
  "removeNonExistentParameters.js",
  "tools/lint/eslint"
];

function processScript(file, relativePath = "", startLine = 1) {
  file = file.replace(/^#/gm, "//XPCShell-preprocessor-");

  try {
    let removals = [];
    Reflect.parse(file, {
      source: relativePath,
      line: startLine,
      builder: {
        callExpression: function(callee, args, loc) {
          if (!callee ||
              callee.type != "MemberExpression" ||
              callee.computed ||
              callee.property.type != "Identifier" ||
              callee.object.type != "MemberExpression" ||
              callee.object.property.type != "Identifier" ||
              callee.object.object.type != "Identifier" ||
              callee.object.object.name != "Services" ||
              !(callee.object.property.name in Services) ||
              !(callee.property.name in Services[callee.object.property.name]))
            return ({type: "", loc: loc});

          try {
            let expected =
              Services[callee.object.property.name][callee.property.name].length;
            if (args.length > expected) {
              let fromLoc;
              if (expected)
                fromLoc = args[expected - 1].loc.end;
              else
                fromLoc = args[0].loc.start;
              let toLoc = args[args.length - 1].loc.end;
              removals.push({from_line: fromLoc.line - startLine,
                             from_column: fromLoc.column,
                             to_line: toLoc.line - startLine,
                             to_column: toLoc.column
                            });
            }
          } catch(ex) { dump("ex = " + ex + "\n"); }

          return ({type: "", loc: loc});
        }
      }
    });

    if (!removals.length)
      return null;

    let lines = file.split("\n");
    let removal;
    while ((removal = removals.pop())) {
      let line = lines[removal.from_line].slice(0, removal.from_column) +
                 lines[removal.to_line].slice(removal.to_column);
      lines[removal.from_line] = line;
      lines.splice(removal.from_line + 1, removal.to_line - removal.from_line);
    }

    return lines.join("\n").replace(/^\/\/XPCShell-preprocessor-/gm, "#");
  } catch (ex) {
    dump("Error reading " + relativePath + ":" + ex.lineNumber + " " + ex + "\n");
    return null;
  }
}

Task.spawn(function() {
  let currentDirectory = yield OS.File.getCurrentDirectory();
  let ignoredPaths = kIgnorePaths.map(p => currentDirectory + "/" + p);

  let paths = [currentDirectory];
  let decoder = new TextDecoder();

  while (paths.length) {
    let iterator;
    try {
      iterator = new OS.File.DirectoryIterator(paths.pop());

      for (let child in iterator) {
        child = yield child;

        let path = child.path;
        if (ignoredPaths.includes(path))
          continue;

        if (child.isDir) {
          paths.push(path);
          continue;
        }

        if (!path.endsWith(".js") && !path.endsWith(".jsm") && !path.endsWith(".xml"))
          continue;

        let file = decoder.decode(yield OS.File.read(path));
        if (!file.includes("Services."))
          continue;

        let relativePath = path.slice(currentDirectory.length + 1);
        if (path.endsWith(".js") || path.endsWith(".jsm")) {
          file = processScript(file, relativePath);
        } else {
          // Handle XBL bindings
          if (!file.includes("xmlns=\"http://www.mozilla.org/xbl\""))
            continue;

          let lines = file.split("\n");
          let startLine, endLine;
          for (startLine = 0; startLine < lines.length; ++startLine) {
            if (lines[startLine].includes("<![CDATA[")) {
              let prefix = lines[startLine].replace(/.*<!\[CDATA\[/, "");
              for (endLine = ++startLine; endLine < lines.length; ++endLine) {
                if (lines[endLine].includes("]]>"))
                  break;
              }
              let suffix = lines[endLine].replace(/\]\]>.*/, "");
              let f = lines.slice(startLine, endLine).join("\n");
              if (!f.includes("Services."))
                continue;
              f = processScript("function f() {" + prefix + "\n"+f+"\n" + suffix + "}",
                                path, startLine);
              if (!f)
                continue;
              let modifiedLines = f.split("\n");
              modifiedLines.shift();
              modifiedLines.pop();
              lines.splice(startLine, endLine - startLine, ...modifiedLines);
              startLine += modifiedLines.length;
            }
          }
          file = lines.join("\n");
        }

        if (file)
          yield OS.File.writeAtomic(path, (new TextEncoder()).encode(file));
      }
    } catch (ex) {
      // Ignore StopIteration to prevent exiting the loop.
      if (ex != StopIteration) {
        throw ex;
      }
    }
    iterator.close();
  }
  done = true;
});

// Spin an event loop.
(() => {
  var thread = Components.classes["@mozilla.org/thread-manager;1"]
                         .getService().currentThread;
  while (!done)
    thread.processNextEvent(true);

  // get rid of any pending event
  while (thread.hasPendingEvents())
    thread.processNextEvent(true);
})();

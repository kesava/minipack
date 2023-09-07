const fs = require('fs');
const path = require('path');
const babylon = require('@babel/parser');
const traverse = require('babel-traverse').default;
const { transformFromAst } = require('@babel/core');

let ID = 0;

function isDirectorySync(path) {
  try {
    const stats = fs.statSync(path);
    return stats.isDirectory();
  } catch (e) {}
}

function isFileSync(path) {
  try {
  const stats = fs.statSync(path);
  return stats.isFile();
  } catch (e) {}
}
// We start by creating a function that will accept a path to a file, read
// its contents, and extract its dependencies.
function createAsset(filename) {
  // check if the filename is a directory path, in which case it is probably a index.js file
  if (isDirectorySync(filename)) {
    filename = path.join(filename, 'index.js');
  } else {
    // append .js if there is a no file ending
    if (!filename.endsWith('.js') && !filename.endsWith('.jsx')) {
      filename = `${filename}.js`;
      if (!isFileSync(filename)) return {
    id: 0,
    filename: '',
    dependencies: [],
    code: '',
  };
      // console.log({ filename, isFile: isFileSync(filename) });
    }
  }

  // Read the content of the file as a string.
  const content = fs.readFileSync(filename, 'utf-8');

  let ast = '';
  try {
    ast = babylon.parse(content, {
      sourceType: 'module',
      errorRecovery: true,
      plugins: [
        'jsx',
        'objectRestSpread',
        'optionalChaining',
        'nullishCoalescingOperator',
        'exportNamespaceFrom',
      ],
    }); 
  } catch (e) {
    console.error({ e });
  }

  // console.log({ ast })

  // This array will hold the relative paths of modules this module depends on.
  const dependencies = [];

  // We traverse the AST to try and understand which modules this module depends
  // on. To do that, we check every import declaration in the AST.
  traverse(ast, {
    ImportDeclaration: ({ node }) => {
      // We push the value that we import into the dependencies array.
      dependencies.push(node.source.value);
    },
  });

  // We also assign a unique identifier to this module by incrementing a simple
  // counter.
  const id = ID++;
  const { code } = transformFromAst(ast, null, {
    presets: [],
  });

  // Return all information about this module.
  return {
    id,
    filename,
    dependencies,
    code,
  };
}

function createGraph(entry) {
  // Start by parsing the entry file.
  const mainAsset = createAsset(entry);

  const queue = [mainAsset];

  for (const asset of queue) {
    asset.mapping = {};

    // This is the directory this module is in.
    const dirname = path.dirname(asset.filename);

    // We iterate over the list of relative paths to its dependencies.
    asset.dependencies.forEach((relativePath) => {
      const absolutePath = path.join(dirname, relativePath);
      const child = createAsset(absolutePath);
      asset.mapping[relativePath] = child.id;
      queue.push(child);
    });
  }

  return queue;
}

function bundle(graph) {
  let modules = '';

  graph.forEach((mod) => {
    modules += `${mod.id}: [
      function (require, module, exports) {
        ${mod.code}
      },
      ${JSON.stringify(mod.mapping)},
    ],`;
  });

  const result = `
    (function(modules) {
      function require(id) {
        const [fn, mapping] = modules[id];

        function localRequire(name) {
          return require(mapping[name]);
        }

        const module = { exports : {} };

        fn(localRequire, module, module.exports);

        return module.exports;
      }

      require(0);
    })({${modules}})
  `;

  return result;
}

const graph = createGraph(
  'file.js'
);
const result = bundle(graph);

console.log(result);

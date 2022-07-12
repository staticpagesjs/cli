# Static Pages / CLI

[![Build Status](https://app.travis-ci.com/staticpagesjs/cli.svg?branch=master)](https://app.travis-ci.com/staticpagesjs/cli)

This package is the static pages generator command-line tool.
It does not bundle **readers** or **writers**, you must install them separately.
Globally installed readers and writers are supported, just set the `NODE_PATH` env variable to point to your global npm packages folder. Run `npm root -g` to find where it is.

Yet another static pages generator?
Yes! Because I browsed the whole jamstack scene, but could not find one which
1. uses MVC pattern
2. can read input from any source (YAML, JSON, front-matter style markdowns, database etc.)
3. can render with any template engine (Twig, ejs, Pug, Mustache etc.)
4. supports incremental builds
5. has a flexible CLI tool (see [@static-pages/cli](https://www.npmjs.com/package/@static-pages/cli) on npm)
6. has a Docker image (see [staticpages/cli](https://hub.docker.com/repository/docker/staticpages/cli) on dockerhub)
7. written in JS (preferably TypeScript)
8. easy to extend with JS code
9. learning and using is easy (Gatsby, Hugo, Jekyll, Eleventy etc. are so cool but harder to learn and configure)

And because I wrote a ton of custom static generators before; I tought I can improve the concepts to a point where its (hopefully) useful for others.

## Where should I use this?
This project targets small and medium sized projects. The rendering process tries to be as fast as possible so its also useful when you need performance.

## Documentation
[Visit the project page.](https://staticpagesjs.github.io/)

## Usage

Show information about the command line arguments:
```shell
$ staticpages --help
```

There are two usage patterns available, one is to create a configuration file and load that, alternatively you can supply the configuration via command line arguments.

### Load configuration from a file:
```shell
$ staticpages [-c|--config <file>]
```

Example:
```shell
$ staticpages --config staticpages.yaml
```

### Set configuration with CLI options:
```shell
$ staticpages [--from <package>]
              [--from.module <name>]
              [--from.export <name>]
              [--from.args.* <value>]
              [--to <package>]
              [--to.module <name>]
              [--to.export <name>]
              [--to.args.* <value>]
              [--controller <package>]
              [--controller.module <package>]
              [--controller.export <name>]
              [--variables.* <value>]
```

Example:
```shell
$ staticpages --from.module @static-pages/markdown-reader \
              --from.args.cwd pages \
              --to.module @static-pages/twig-writer \
              --to.args.view content.html.twig \
              --controller ./controllers/my-pages-controller.js
```

> Tip: This tool uses [.env](https://www.npmjs.com/package/dotenv) files. Controlles can access these env variables in the usual way via `process.env`.

## Configuration file format

Can be in JSON or YAML format. It must contain one or more `Route` entries (in array or simply as one object).

A `Route` defines
- a **data source** (`from`),
- a **controller** (`controller`) where your data can be transformed and
- a **destination** (`to`) which will render the final page.

> Additional variables can be added to the `Route`, these properties will be accessible in the `controller` via the `this` context.

Formally:
```ts
interface Route {
    from: string | {
        module: string;
        export?: string;
        args?: unknown;
    };
    to: string | {
        module: string;
        export?: string;
        args?: unknown;
    };
    controller?: string | {
        module: string;
        export?: string;
    };
    variables?: {
      [additionalProps: string]: unknown;
    };
}
```

The `from` property can be a string to an npm package or a local commonjs module OR an object with the following keys:
- `from.module` is a string to an npm package or a local commonjs module. The module must export a factory function that returns an `Iterable` or an `AsyncIterable`.
- `from.export` defines the exported factory function name. Defaults to use the `default` export, if not exists then fallbacks to `module.exports`.
- `from.args` is passed to the reader factory function as arguments. If args is not an array, it is converted to an array.

The `to` property can be a string to an npm package or a local commonjs module OR an object with the following keys:
- `to.module` is a string to an npm package or a local commonjs module. The module must export a factory function that returns a `(data: object): void` function.
- `to.export` defines the exported factory function name. Defaults to use the `default` export, if not exists then fallbacks to `module.exports`.
- `to.args` is passed to the writer factory function as arguments. If args is not an array, it is converted to an array.

The `controller` property can be a string to an npm package or a local commonjs module OR an object with the following keys:
- `controller.module` is a string to an npm package or a local commonjs module.
- `controller.export`defines the exported factory function name. Defaults to use the `default` export, if not exists then fallbacks to `module.exports`.

The `variables` contains additional properties that should be accessible from the controller context (as this.&lt;variable&gt;).

#### Sample with a single route
```yaml
from:
  module: '@static-pages/markdown-reader'
  args:
    cwd: pages
    pattern: '**/*.md'
to:
  module: '@static-pages/twig-writer'
  args:
    view: content.html.twig
    viewsDir: path/to/views/folder
    outDir: path/to/output/folder
controller: ./controllers/my-controller.js
```

#### Sample with multiple routes
```yaml
- from: '@static-pages/markdown-reader'
  to:
    module: '@static-pages/twig-writer'
    args:
      view: content.html.twig
      viewsDir: path/to/views/folder
      outDir: path/to/output/folder
  controller: ./controllers/my-pages-controller.js
- from:
    module: '@static-pages/yaml-reader'
    args:
      cwd: home
      pattern: '*.yaml'
  to:
    module: '@static-pages/twig-writer'
    args:
      view: home.html.twig
      viewsDir: path/to/views/folder
      outDir: path/to/output/folder
  controller: ./controllers/my-home-controller.js
```

> Tip: Controllers can be stored along with the \*.md/\*.yaml/data files in your local repository.

## Advanced `from.args` and `to.args` parsing

Sometimes reader and writer `args` requires a callback function or some complex data structure that is available in an external JS file, eg. the `view` argument of the `@static-pages/twig-writer` can accept a function.

In these cases we introduce naming conventions on property names to allow this cli tool to parse and provide the needed objects.
These naming conventions are appiled recursively on each property name of the entire `args` object.

### Functions

Functions can be parsed from string and loaded in the following way: append `$function` keyword to the property name of the target propery.

```yaml
to:
  module: '@static-pages/twig-writer'
  args:
    view$function: (d) => d.layout
```

The `$function` keyword will be stripped from the property name and the string value will be converted to a function before calling the writer factory (`twigWriter(args)` in this case).

### Importing from JS files

Append `$import` keyword to the propery name to import from JS files.
Provide the value as a string (import that module with the default import) or as an object with `module` and `export` properties. The `export` property is optional and defaults to `default`.

```yaml
to:
  module: '@static-pages/twig-writer'
  args:
    globals$import:
      module: ./myglobals.js
      export: globals
```

```js
// myglobals.js
module.exports = {
  globals: {
    myProp: 'myValue'
  }
};
```

This way `to.args.globals` will contain the `{ myProp: 'myValue' }` object.

### Stop the parsing on specific objects

There are some cases where parsing the configuration can be an unwanted feature.
In these cases append the `$raw` keyword to your property name and the given value will be preserved as-is, parsing stops on that level.

```yaml
to:
  module: '@static-pages/twig-writer'
  args:
    globals$raw:
      my$function: some value
```

In this case the `to.args.globals` will be `{ my$function: 'some value' }`. Notice the `$function` postfixed property is kept as-is.

## Do you really need this CLI tool?

Its possible to use the `@static-pages/core` package alone for automated builds if you keep your configuration in a js file. This eliminates the complexity of this CLI tool.

> Usually the recommended production setup is to use the JS API and ignore this CLI tool.

See below an example, start it like `node generate.js`:

```js
// ./generate.js
const { staticPages } = require('@static-pages/core');
const { markdownReader } = require('@static-pages/markdown-reader');
const { twigWriter } = require('@static-pages/twig-writer');

staticPages([{
  from: markdownReader({
    cwd: 'pages',
    pattern: '**/*.md',
  }),
  to: twigWriter({
    view: 'content.html.twig',
    viewsDir: 'path/to/views/folder',
    outDir: 'path/to/output/folder',
  }),
  controller: function(data) {
    data.commitHash = yourGetCommitHashFn();
    return data;
  }
}]).catch(e => { console.error(e); process.exit(1); });
```

## Missing a feature?
Create an issue describing your needs. If it fits the scope of the project I will implement it or you can implement it your own and submit a pull request.

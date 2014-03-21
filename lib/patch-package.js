'use strict';

var path = require('path');
var url = require('url');
var Batch = require('batch');

/**
 * Really install the component.
 *
 * @api public
 */

module.exports.reallyInstall = function(){
  var self = this;
  var i = 0;
  var batch;
  var last;

  next();

  function next() {
    self.remote = self.remotes[i++];
    if (!self.remote) {
      return self.destroy(function (error) {
        if (error) self.emit('error', error);
        self.emit('error', new Error('can\'t find remote for "' + self.name + '"'));
      });
    }

    // parse remote
    last = i == self.remotes.length;
    self.remote = url.parse(self.remote);

    // strip trailing /
    self.remote.href = self.remote.href.slice(0, -1);

    // only error on the last remote otherwise
    // we assume it may be fetchable
    self.once('error', next);

    // kick off installation
    batch = new Batch;
    self.getJSON(function(err, json){

      // # Patch: use name defined in component.json as dirname
      self.dirname = function () {
        return path.resolve(self.dest, json.name);
      };
      // # End patch

      if (err) {
        err.fatal = 404 != err.status || last;
        return self.emit('error', err);
      }

      var files = [];
      if (json.scripts) files = files.concat(json.scripts);
      if (json.styles) files = files.concat(json.styles);
      if (json.templates) files = files.concat(json.templates);
      if (json.files) files = files.concat(json.files);
      if (json.images) files = files.concat(json.images);
      if (json.fonts) files = files.concat(json.fonts);
      if (json.json) files = files.concat(json.json);
      json.repo = json.repo || self.remote.href + '/' + self.name;

      if (json.dependencies) {
        batch.push(function(done){
          self.getDependencies(json.dependencies, done);
        });
      }

      batch.push(function(done){
        self.mkdir(self.dirname(), function(err){
          // # Patch: don't destroy json variable
          self.writeFile('component.json', JSON.stringify(json, null, 2), done);
          // # End patch
        });
      });

      // # Patch: build a package.json from component.json file
      batch.push(function(done){
        self.mkdir(self.dirname(), function(err){
          var packageJson = {
            name:        json.name,
            version:     json.version,
            description: json.description,
            keywords:    json.keywords,
            main:        json.main,
            license:     json.license,
            repository:  {
              'type':   'git',
              'url':    'http://github.com/' + json.repo + '.git'
            }
          };
          self.writeFile('package.json', JSON.stringify(packageJson, null, 2), done);
        });
      });
      // # End patch


      batch.push(function(done){
        self.mkdir(self.dirname(), function(err){
          self.getFiles(files, done);
        });
      });

      batch.end(function(err){
        if (err) {
          err.fatal = last;
          self.emit('error', err);
        }

        self.emit('end');
      });
    });
  }
};
function createServicePackSuite(execlib,clientFactory){
  'use strict';
  var servicePackSuite = {
    NotAllexModuleError: require('./notallexmoduleerrorcreator')(execlib),
    UserSpawner: require('./userspawnercreator')(execlib,clientFactory)
  };
  require('./registrycreator')(execlib,servicePackSuite);
}

module.exports = createServicePackSuite;

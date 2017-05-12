function createNotAllexModuleError(execlib){
  'use strict';
  var lib = execlib.lib,
      AllexError = lib.Error;
  function NotAllexModuleError(modulename){
    var ret = new AllexError('MODULE_NOT_AN_ALLEX_SERVICE_PACK','Module named '+modulename+' does not export the service and sinkmap functions');
    ret.modulename = modulename;
    return ret;
  }
  lib.inherit(NotAllexModuleError,AllexError);
  return NotAllexModuleError;
}

module.exports = createNotAllexModuleError;

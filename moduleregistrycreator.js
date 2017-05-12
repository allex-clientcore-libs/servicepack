function createModuleRegistry(execlib,servicePackSuite){
  'use strict';
  var lib = execlib.lib,
    q = lib.q,
    execSuite = execlib.execSuite,
    RegistryBase = execSuite.RegistryBase,
    NotAllexModuleError = servicePackSuite.NotAllexModuleError;

  function isAServicePackSide (side) {
    if (!lib.isFunction(side)) {
      return (side && lib.isFunction(side.cb) && lib.isArray(side.dependencies));
    }
    return true;
  }
  function isAServicePack(servicepack) {
    if (!servicepack) {
      return false;
    }
    return isAServicePackSide(servicepack.serverside) && isAServicePackSide(servicepack.clientside);
  }

  function ModuleRegistry(){
    RegistryBase.call(this);
    this.onSuperSink = new lib.HookCollection();
  }
  lib.inherit(ModuleRegistry,RegistryBase);
  ModuleRegistry.prototype.destroy = function(){
    if(!this.onSuperSink){
      return;
    }
    this.onSuperSink.destruct();
    this.onSuperSink = null;
    RegistryBase.prototype.destroy.call(this);
  };
  ModuleRegistry.prototype.processNewServicePack = function (modulename, servicepack) {
    if (!isAServicePack(servicepack)) {
      console.trace();
      console.log('what is', servicepack, '?');
      throw new NotAllexModuleError(modulename);
    }
  };
  ModuleRegistry.prototype.weWillSeeAboutThis = function (modulename, servicepack) {
    var Service = servicepack.Service,
      SinkMap = servicepack.SinkMap,
      browserifymode = 'undefined' !== typeof window,
      ServiceSink;

    if (!SinkMap) {
      if (!(servicepack instanceof lib.Fifo)) {
        console.trace();
        console.log('what is', servicepack, '?');
        throw new NotAllexModuleError(modulename);
      }
      return;
    }
    if('function' !== typeof Service && !browserifymode){
      throw new NotAllexModuleError(modulename);
    }
    SinkMap.traverse(function(sinkctor,role){
      sinkctor.prototype.role = role;
      sinkctor.prototype.modulename = modulename;
    });
    if(!browserifymode){
      //provide the neccessary bridge between ServiceSink for the 'service' role
      //and the Service's userFactory
      ServiceSink = SinkMap.get('service');
      if(ServiceSink){
        ServiceSink.prototype.findUserCtor = function(role){
          return Service.prototype.userFactory.get(role);
        };
      }
      Service.prototype.modulename = modulename;
      Service.prototype.userFactory.traverse(function(userctor){
        userctor.prototype.modulename = modulename;
      });
    }else{
      if (servicepack.Service) {
        servicepack.Service = null;
      }
    }
    if(lib.isArray(servicepack.Tasks)){
      servicepack.Tasks.forEach(taskRegistry.registerClass.bind(taskRegistry));
    }
  };
  ModuleRegistry.prototype.add = function(modulename,servicepack){
    if (!lib.isString(modulename)) {
      console.trace();
      console.error(modulename, 'not a string');
      process.exit(0);
      return;
    }
    try {
    this.processNewServicePack(modulename, servicepack);
    return RegistryBase.prototype.add.call(this,modulename,servicepack);
    } catch (e) {
      console.error(e.stack);
      console.error(e);
    }
  };
  ModuleRegistry.prototype.replace = function (modulename, servicepack) {
    try {
    this.processNewServicePack(modulename, servicepack);
    return RegistryBase.prototype.replace.call(this, modulename, servicepack);
    } catch (e) {
      console.error(e.stack);
      console.error(e);
    }
  };
  ModuleRegistry.prototype.resolve = function(servicepackname,role,client,prophash,defer){
    var sp = this.get(servicepackname);
    if(!sp || sp instanceof lib.Fifo){
      if(servicepackname){
        this.register(servicepackname).done(
          this.resolve.bind(this, servicepackname, role, client, prophash, defer),
          defer.reject.bind(defer)
        );
        servicepackname = null;
        role = null;
        client = null;
        prophash = null;
        defer = null;
        return;
      }
    }
    if (!sp.SinkMap) {
      console.log('what is sp?', sp);
      role = null;
      client = null;
      prophash = null;
      defer = null;
      throw new NotAllexModuleError(servicepackname);
    }
    if(role==='superuser'){
      role='service';
    }
    if(!role){
      defer.reject('No role');
      servicepackname = null;
      role = null;
      client = null;
      prophash = null;
      defer = null;
      return;
    }
    var f = sp.SinkMap.get(role);
    if(!f){
      console.trace();
      defer.reject('No factory function for role '+role);
      servicepackname = null;
      role = null;
      client = null;
      prophash = null;
      defer = null;
      return;
    }
    //prophash.modulename = servicepackname;
    defer.resolve(new f(prophash,client));
    servicepackname = null;
    role = null;
    client = null;
    prophash = null;
    defer = null;
  };

  return ModuleRegistry;
}

module.exports = createModuleRegistry;

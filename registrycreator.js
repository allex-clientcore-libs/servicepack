var Path = require('path');
function createServicePackRegistry(execlib,servicePackSuite) {
  'use strict';
  var lib = execlib.lib,
    q = lib.q,
    UserSpawner = servicePackSuite.UserSpawner,
    execSuite = execlib.execSuite,
    ModuleRegistry = require('./moduleregistrycreator')(execlib,servicePackSuite),
    taskRegistry = execSuite.taskRegistry,
    NotAllexModuleError = servicePackSuite.NotAllexModuleError;

  if(execSuite.registry){
    return;
  }

  function isAServicePackSide (side) {
    if (!lib.isFunction(side)) {
      return (side && lib.isArray(side.dependencies));
    }
    return true;
  }
  function isAServicePack(servicepack, modulename) {
    if (!servicepack) {
      return false;
    }
    if (isAServicePackSide(servicepack.service) && isAServicePackSide(servicepack.sinkmap)) {
      if (!servicepack.dirname) {
        servicepack.dirname = Path.dirname(require.resolve(modulename));
      }
      return true;
    }
    return false;
  }

  function ServicePackRegistry () {
    this.moduleRegistry = new execSuite.RegistryBase();
    this.superSinks = new lib.Map();
    this.clientSides = new lib.DIContainer();
    this.serverSides = new lib.DIContainer();
    this.onSuperSink = new lib.HookCollection();
  }
  ServicePackRegistry.prototype.destroy = function () {
    if(!this.onSuperSink){
      return;
    }
    this.onSuperSink.destroy();
    if (this.serverSides) {
      this.serverSides.destroy();
    }
    this.serverSides = null;
    if (this.clientSides) {
      this.clientSides.destroy();
    }
    this.clientSides = null;
    this.onSuperSink = null;
    if (this.superSinks) {
      lib.containerDestroyAll(this.superSinks);
      this.superSinks.destroy();
    }
    this.superSinks = null;
  };
  ServicePackRegistry.prototype.spawn = function(prophash,connectstring,credentials,session){
    var us = new UserSpawner(this,prophash,connectstring,credentials,session);
    return us.defer.promise;
  };
  ServicePackRegistry.prototype.maybeDoTasks = function (modulename, servicepack) {
    if (!servicepack.tasks) {
      return q(true);
    }
    if (!taskRegistry.moduleDone(modulename)) {
      return this.doDaSide('tasks', servicepack).then(
        this.onTasksDone.bind(this, modulename)
      );
    }
    return q(taskRegistry.modulesDone.waitFor(modulename));
  };
  ServicePackRegistry.prototype.getClientSide = function (modulename) {
    return this.clientSides.get(modulename);
  };
  ServicePackRegistry.prototype.registerClientSide = function (modulename, mod) {
    var m;
    if (mod) {
      return this.clientSides.register(modulename, mod);
    }
    m = this.clientSides.get(modulename);
    if (m) {
      return q(m);
    } else {
      if ('undefined' !== typeof window) {
        console.error(modulename, 'is not registered');
      }
    }
    return this.moduleRegistry.register(modulename).then(
      this.onRegisterForClientSide.bind(this, modulename)
    );
  };
  ServicePackRegistry.prototype.onRegisterForClientSide = function (modulename, servicepack) {
    var cs = this.getClientSide(modulename);
    if (!cs) {
      if (!isAServicePack(servicepack, modulename)) {
        throw NotAllexModuleError(modulename);
      }
      return this.maybeDoTasks(modulename, servicepack).then(
        this.onTasksForClientSide.bind(this, modulename, servicepack)
      );
    }
    return q(cs);
  };
  ServicePackRegistry.prototype.onTasksForClientSide = function (modulename, servicepack) {
    if (!this.clientSides.busy(modulename)) {
      this.clientSides.waitFor(modulename);
      return this.doDaSide('client', servicepack).then(
        this.onClientSideDone.bind(this, modulename)
      );
    }
    return this.clientSides.waitFor(modulename);
  };
  ServicePackRegistry.prototype.onClientSideDone = function (modulename, sinkmap) {
    if (this.getClientSide(modulename)) {
      return;
    }
    sinkmap.traverse(function(sinkctor,role){
      sinkctor.prototype.role = role;
      sinkctor.prototype.modulename = modulename;
    });
    this.clientSides.register(modulename, sinkmap);
    modulename = null;
    return q(sinkmap);
  };
  ServicePackRegistry.prototype.onTasksDone = function (modulename, tasks) {
    taskRegistry.register(modulename, tasks);
  };
  ServicePackRegistry.prototype.registerServerSide = function (modulename) {
    return this.moduleRegistry.register(modulename).then(
      this.onRegisterForServerSide.bind(this, modulename)
    );
  };
  ServicePackRegistry.prototype.onRegisterForServerSide = function (modulename, servicepack) {
    var ss = this.serverSides.get(modulename);
    if (!ss) {
      if (!isAServicePack(servicepack, modulename)) {
        throw NotAllexModuleError(modulename);
      }
      return this.maybeDoTasks(modulename, servicepack).then(
        this.onTasksForServerSide.bind(this, modulename, servicepack)
      );
    }
    return q(ss);
  };
  ServicePackRegistry.prototype.onTasksForServerSide = function (modulename, servicepack) {
    if (!this.serverSides.busy(modulename)) {
      this.serverSides.waitFor(modulename);
      return this.doDaSide('server', servicepack).then(
        this.onServerSideDone.bind(this, modulename)
      );
    }
    return this.serverSides.waitFor(modulename);
  };
  ServicePackRegistry.prototype.onServerSideDone = function (modulename, service) {
    var _ce = console.error.bind(console), _pe = process.exit.bind(process);
    service.prototype.modulename = modulename;
    service.prototype.userFactory.traverse(function(userctor){
      if (!userctor.inherit) {
        _ce('no inherit', modulename, userctor.prototype.role);
        _pe(0);
      }
      userctor.prototype.modulename = modulename;
    });
    _pe = null;
    _ce = null;
    this.serverSides.register(modulename, service);
    modulename = null;
    return q(service);
  };
  ServicePackRegistry.prototype.add = function(modulename,servicepack){
    return this.moduleRegistry.register(modulename, servicepack);
  };
  ServicePackRegistry.prototype.getServerSide = function(modulename) {
    return this.serverSides.get(modulename);
  };
  ServicePackRegistry.prototype.getModule = function (modulename) {
    return this.moduleRegistry.get(modulename);
  };
  function onLoadDependencies (cb, defer) {
    var args = Array.prototype.slice.call(arguments, 2);
    args.unshift(execlib);
    if (lib.isString(cb)) {
      try {
        cb = require(cb);
      } catch(e) {
        console.error('Error in', cb);
        console.error(e);
        defer.reject(e);
        cb = null;
        defer = null;
        return;
      }
    }
    var ret = cb.apply(null, args);
    cb = null;
    defer.resolve(ret);
    defer = null;
  }
  ServicePackRegistry.prototype.doDaSide = function (sidename, servicepack) {
    var side, sidemodulename, d, cb;
    switch(sidename) {
      case 'server':
        side = servicepack.service;
        sidemodulename = 'servicecreator';
        break;
      case 'client':
        side = servicepack.sinkmap;
        sidemodulename = 'sinkmapcreator';
        break;
      case 'tasks':
        side = servicepack.tasks;
        sidemodulename = 'taskcreator';
        break;
    }
    if (!side) {
      throw new lib.JSONizingError('NO_SERVICEPACK_SIDE', servicepack, 'Missing '+sidename+':');
    }
    if (lib.isFunction(side)) {
      return q(side(execlib));
    }
    cb = side.cb;
    if (!cb) {
      cb = Path.join(servicepack.dirname, sidemodulename);
    }
    d = q.defer();
    execlib.loadDependencies(sidename, side.dependencies, onLoadDependencies.bind(null, cb, d));
    return d.promise;
  };
  ServicePackRegistry.prototype.resolve = function(servicepackname,role,client,prophash,defer){
    this.registerClientSide(servicepackname).then(
      this.onClientSideForResolve.bind(this, role, client, prophash, defer),
      defer.reject.bind(defer)
    );
  };
  ServicePackRegistry.prototype.onClientSideForResolve = function (role, client, prophash, defer, sinkmap) {
    var f;
    if(role==='superuser'){
      role='service';
    }
    if(!role){
      defer.reject('No role');
      role = null;
      client = null;
      prophash = null;
      defer = null;
      return;
    }
    f = sinkmap.get(role);
    if(!f){
      console.trace();
      defer.reject('No factory function for role '+role);
      role = null;
      client = null;
      prophash = null;
      defer = null;
      return;
    }
    //prophash.modulename = servicepackname;
    defer.resolve(new f(prophash,client));
    role = null;
    client = null;
    prophash = null;
    defer = null;
  };
  function SuperSinkSlot(registry,supersinkitem){
    this.registry = registry;
    this.name = supersinkitem.content.name;
  }
  SuperSinkSlot.prototype.destroy = function(){
    console.log('removing',this.name);
    this.registry.onSuperSink.fire(this.name,null);
    this.registry.superSinks.remove(this.name);
    this.name = null;
    this.registry = null;
  };
  ServicePackRegistry.prototype.registerSuperSink = function(serviceinstancename,supersink){
    console.log(process.pid+'','registering supersink',serviceinstancename,'('+supersink.modulename+':'+supersink.role+')');
    supersink.extendTo(new SuperSinkSlot(this,this.superSinks.add(serviceinstancename,supersink)));
    this.onSuperSink.fire(serviceinstancename,supersink);
  };
  ServicePackRegistry.prototype.getSuperSink = function(supersinkname){
    return this.superSinks.get(supersinkname);
  };

  execSuite.registry = new ServicePackRegistry;
}

module.exports = createServicePackRegistry;

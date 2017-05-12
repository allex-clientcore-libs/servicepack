function createUserSpawner(execlib,clientFactory){
  'use strict';
  var lib = execlib.lib,
      q = lib.q;
  function UserSpawner(factory,prophash,connectstring,credentials,session){
    this.defer = q.defer();
    this.factory = factory;
    this.prophash = prophash;
    this.authListener = null;
    this.destroyedListener = null;
    if(connectstring){
      var c;
      try{
        c = clientFactory(connectstring,credentials,session);
      }
      catch(e){
        console.error(e.stack);
        console.error(e);
        this.onAuthenticated(e,null,null);
        return;
      }
      if(c){
        this.authListener = c.authenticated.attach(this.onAuthenticated.bind(this));
        this.destroyedListener = c.destroyed.attach(this.onClientDestroyed.bind(this));
      }else{
        this.onClientDestroyed(new lib.UnconnectableError(connectstring),null,null);
      }
    }else{
      this.onClientDestroyed(new lib.UnconnectableError(connectstring),null,null);
    }
  }
  UserSpawner.prototype.destroy = function(){
    if(this.destroyedListener){
      this.destroyedListener.destroy();
    }
    this.destroyedListener = null;
    if(this.authListener){
      this.authListener.destroy();
    }
    this.authListener = null;
    this.prophash = null;
    this.factory = null;
    this.defer = null;
  };
  UserSpawner.prototype.onAuthenticated = function(client,servicepackname,role){
    if(!this.defer){
      return;
    }
    if (!servicepackname) {
      console.trace();
      if (process && lib.isFunction(process.exit)) {
        process.exit(0);
      }
      return;
    }
    this.factory.resolve(servicepackname,role,client,this.prophash,this.defer);
    lib.runNext(this.destroy.bind(this));
  };
  UserSpawner.prototype.onClientDestroyed = function(exception){
    if(!this.factory){//dead since onAuthenticated
      return;
    }
    if(exception){
      this.defer.reject(exception);
    }
    lib.runNext(this.destroy.bind(this));
  };
  return UserSpawner;
}

module.exports = createUserSpawner;

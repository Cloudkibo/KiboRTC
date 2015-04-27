(function () {

  // Create all modules and define dependencies to make sure they exist
  // and are loaded in the correct order to satisfy dependency injection
  // before all nested files are concatenated by Gulp

  // Config
  angular.module('kiboRtc.config', [])
      .value('kiboRtc.config', {
          debug: true
      });

  // Modules
  angular.module('kiboRtc.directives', []);
  angular.module('kiboRtc.filters', []);
  angular.module('kiboRtc.services', []);
  angular.module('kiboRtc',
      [
          'kiboRtc.config',
          'kiboRtc.directives',
          'kiboRtc.filters',
          'kiboRtc.services'
      ]);

})();

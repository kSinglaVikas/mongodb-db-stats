var _version = "0.1";

(function () {
  "use strict";
})();

function parseCollectionStatsCreationString(creationString) {
  var parsed = [];

  try {
    if (!creationString) return parsed;

    creationString.split(",").forEach(function (part) {
      if (part.startsWith("block_compressor")) {
        parsed.push({ block_compressor: part.split("=")[1] });
      }
    });
  } catch (err) {
    _errors.push({
      function: "parseCollectionStatsCreationString",
      error: err,
    });
  }

  return parsed;
}

function printInfo(message, command) {
  var result = false;

  try {
    result = command();
  } catch (err) {
    if (!_printJSON) {
      print("Error running '" + message + "':");
      print(err);
    }
    _errors.push({ function: "printInfo", message: message, error: err });
  }

  _output[message] = result;
  if (!_printJSON) printjson(result);
  return result;
}

function buildCollectionStats(databaseName, collectionInfo, isTimeSeries) {
  var targetDB = db.getSiblingDB(databaseName);
  var collectionName = collectionInfo.name;

  var indexStats = [];
  try {
    var indexStatsResult = targetDB.runCommand({
      aggregate: collectionName,
      pipeline: [{ $indexStats: {} }, { $project: { host: 0, spec: 0 } }],
      cursor: {},
    });
    indexStats =
      indexStatsResult &&
      indexStatsResult.cursor &&
      indexStatsResult.cursor.firstBatch
        ? indexStatsResult.cursor.firstBatch
        : [];
  } catch (err) {
    // Some environments may not support $indexStats; keep output usable.
    indexStats = [];
  }

  if (isTimeSeries) {
    var tsStats = targetDB.runCommand({
      aggregate: collectionName,
      pipeline: [{ $collStats: { storageStats: {}, count: {} } }],
      cursor: {},
    }).cursor.firstBatch[0];

    var storageStats = tsStats.storageStats;

    return {
      name: collectionName,
      type: "timeseries",
      dataSize: storageStats.size,
      storageSize: storageStats.storageSize,
      bucketCount: storageStats.timeseries && storageStats.timeseries.bucketCount,
      avgBucketSize: storageStats.timeseries && storageStats.timeseries.avgBucketSize,
      freeStorageSize: storageStats.freeStorageSize,
      capped: storageStats.capped,
      nindexes: storageStats.nindexes,
      indexBuilds: storageStats.indexBuilds,
      totalIndexSize: storageStats.totalIndexSize,
      totalSize: storageStats.totalSize,
      creationString:
        storageStats.wiredTiger && storageStats.wiredTiger.creationString,
      parsedCreationString: parseCollectionStatsCreationString(
        storageStats.wiredTiger && storageStats.wiredTiger.creationString
      ),
      indexes: {
        indexSizes: storageStats.indexSizes,
        stats: indexStats,
      },
    };
  }

  var colStats = targetDB.getCollection(collectionName).stats();

  return {
    name: collectionName,
    type: "regular",
    dataSize: colStats.size,
    storageSize: colStats.storageSize,
    count: colStats.count,
    avgObjSize: colStats.avgObjSize,
    freeStorageSize: colStats.freeStorageSize,
    capped: colStats.capped,
    nindexes: colStats.nindexes,
    indexBuilds: colStats.indexBuilds,
    totalIndexSize: colStats.totalIndexSize,
    totalSize: colStats.totalSize,
    creationString: colStats.wiredTiger && colStats.wiredTiger.creationString,
    parsedCreationString: parseCollectionStatsCreationString(
      colStats.wiredTiger && colStats.wiredTiger.creationString
    ),
    indexes: {
      indexSizes: colStats.indexSizes,
      stats: indexStats,
    },
  };
}

function printDatabaseStats() {
  var totalIndexSize = 0;
  var totalStorageSize = 0;
  var totalDataSize = 0;
  var nIndexes = 0;
  var collectionsCounter = 0;

  try {
    var dbs = db.getMongo().getDBs();
    var dbstats = [];

    if (!dbs.databases) {
      throw { message: "No databases returned by getDBs()" };
    }

    dbs.databases.sort(function (a, b) {
      return b.sizeOnDisk - a.sizeOnDisk;
    });

    dbs.databases.forEach(function (dbInfo) {
      if (/^(admin|local|config)$/.test(dbInfo.name)) return;

      var targetDB = db.getSiblingDB(dbInfo.name);
      var stats = targetDB.stats();
      var collectionstats = [];

      targetDB.getCollectionNames().forEach(function (collectionName) {
        if (/^system\./.test(collectionName)) return;
        if (collectionsCounter >= _maxCollections) return;

        collectionstats.push(
          buildCollectionStats(
            dbInfo.name,
            { name: collectionName },
            false
          )
        );
        collectionsCounter++;
      });

      dbstats.push({
        db: stats.db,
        collections: stats.collections,
        views: stats.views,
        dataSize: stats.dataSize,
        storageSize: stats.storageSize,
        indexSize: stats.indexSize,
        totalSize: stats.totalSize,
        avgObjSize: stats.avgObjSize,
        indexes: stats.indexes,
        collectionstats: collectionstats,
      });

      totalIndexSize += Number(stats.indexSize);
      totalStorageSize += Number(stats.storageSize);
      totalDataSize += Number(stats.dataSize);
      nIndexes += Number(stats.indexes);
    });

    printInfo("databaseStats", function () {
      return dbstats;
    });
    printInfo("nDatabases", function () {
      return dbstats.length;
    });
    printInfo("totalDataSize", function () {
      return totalDataSize;
    });
    printInfo("totalStorageSize", function () {
      return totalStorageSize;
    });
    printInfo("totalIndexSize", function () {
      return totalIndexSize;
    });
    printInfo("nCollections", function () {
      return collectionsCounter;
    });
    printInfo("nIndexes", function () {
      return nIndexes;
    });

    if (collectionsCounter > _maxCollections) {
      throw {
        message:
          "MaxCollectionsExceededException: There are " +
          collectionsCounter +
          " collections which is above the max allowed of " +
          _maxCollections +
          ". Output is incomplete.",
      };
    }
  } catch (err) {
    _errors.push({
      function: "printDatabaseStats",
      error: err.message || err,
    });
  }
}

function additionalInfo() {
  printInfo("scriptInfo", function () {
    return { v: _version, ts: new Date() };
  });

  printInfo("errors", function () {
    return _errors;
  });
}

if (typeof _printJSON === "undefined") var _printJSON = true;
if (typeof _maxCollections === "undefined") var _maxCollections = 2500;

var _output = {};
var _errors = [];

try {
  printDatabaseStats();
  additionalInfo();
} catch (e) {
  print("\nERROR: " + e.message);
}

if (_printJSON) print(JSON.stringify(_output, null, 0));

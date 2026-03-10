# MongoDB Sizing Script

The purpose of this script is to collect the data required by a MongoDB Solutions Architect to perform a cluster sizing analysis.

This script has also been tested against Amazon DocumentDB 5.0.0.

The script connects to the target cluster, iterates through non-system databases and collections, and captures sizing-focused metadata such as database-level totals (`dataSize`, `storageSize`, `indexSize`, `totalSize`), collection-level stats (including index sizes and index usage stats where available), and overall cluster totals (number of databases, collections, and indexes). It outputs all results as JSON so it can be shared directly with a MongoDB Solutions Architect for capacity and sizing analysis.

## Prerequisites

- Download and install Mongo Shell.
- Download the sizing script to a terminal that will be used to access the cluster.
- DB user with sufficient permissions. `admin/root` is acceptable. Minimum permissions are noted below.

Example command for creating a database user with the minimum required permissions:

```javascript
db.getSiblingDB("admin").createUser({
	user: "ADMIN_USER",
	pwd: "ADMIN_PASSWORD",
	roles: [ "readAnyDatabase", "clusterMonitor" ]
})
```

## Instructions

Execute the command:

```bash
mongosh "<CONNECTION_STRING>" getDatabaseStats.js --norc --quiet > cluster_name.json
```

Send the output file to the MongoDB Solutions Architect for analysis.
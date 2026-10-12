// The backend engines import the API middleware, whose config module exits
// when DATABASE_URL is unset. The benchmarks never open a database
// connection, so a placeholder is enough. Import this module first.
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://benchmarks:unused@localhost:5432/unused';
process.env.NODE_ENV = process.env.NODE_ENV || 'benchmark';

export {};

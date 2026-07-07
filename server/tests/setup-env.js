process.env.NODE_ENV = 'test';
process.env.MYSQL_HOST = process.env.MYSQL_HOST || '127.0.0.1';
process.env.MYSQL_USER = process.env.MYSQL_USER || 'test_user';
process.env.MYSQL_DATABASE = process.env.MYSQL_DATABASE || 'ccof_walkin_test';
process.env.REDIS_URL = process.env.REDIS_URL || 'redis://127.0.0.1:6379/15';

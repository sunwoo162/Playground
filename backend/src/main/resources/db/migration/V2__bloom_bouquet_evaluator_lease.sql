ALTER TABLE bloom_bouquet_evaluation_runs
    ADD COLUMN worker_id VARCHAR(120) NULL,
    ADD COLUMN heartbeat_at DATETIME NULL,
    ADD COLUMN lease_expires_at DATETIME NULL,
    ADD COLUMN claim_count INT NOT NULL DEFAULT 0;

CREATE INDEX idx_bloom_eval_lease
    ON bloom_bouquet_evaluation_runs (status, lease_expires_at, created_at);

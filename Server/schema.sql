-- Database schema for Push-up Challenge Tracker

-- Users/Spheres table
CREATE TABLE IF NOT EXISTS spheres (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    bio TEXT,
    image_url TEXT NOT NULL,
    cloudinary_public_id VARCHAR(255),
    is_failed BOOLEAN DEFAULT FALSE,
    position_x FLOAT DEFAULT 0,
    position_y FLOAT DEFAULT 0,
    position_z FLOAT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Comments table
CREATE TABLE IF NOT EXISTS comments (
    id SERIAL PRIMARY KEY,
    sphere_id INTEGER NOT NULL REFERENCES spheres(id) ON DELETE CASCADE,
    comment_text TEXT NOT NULL,
    author_name VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_spheres_created_at ON spheres(created_at);
CREATE INDEX IF NOT EXISTS idx_comments_sphere_id ON comments(sphere_id);
CREATE INDEX IF NOT EXISTS idx_comments_created_at ON comments(created_at);

-- Create updated_at trigger
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_spheres_updated_at BEFORE UPDATE
    ON spheres FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
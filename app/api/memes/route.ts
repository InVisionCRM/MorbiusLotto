import { neon } from '@neondatabase/serverless';
import { NextRequest, NextResponse } from 'next/server';

const sql = neon(process.env.DATABASE_URL!);

// Initialize memes table if it doesn't exist
async function initializeTable() {
  await sql`
    CREATE TABLE IF NOT EXISTS memes (
      id SERIAL PRIMARY KEY,
      image_data TEXT NOT NULL,
      template_name VARCHAR(255),
      layers_json TEXT,
      wallet_address VARCHAR(42),
      approval_status VARCHAR(20) DEFAULT 'pending',
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    )
  `;
  // Add approval_status to existing tables (no-op if already exists)
  await sql`ALTER TABLE memes ADD COLUMN IF NOT EXISTS approval_status VARCHAR(20) DEFAULT 'pending'`;
  await sql`UPDATE memes SET approval_status = 'approved' WHERE approval_status IS NULL`;
}

// GET - Fetch all memes
export async function GET(request: NextRequest) {
  try {
    await initializeTable();

    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '50');
    const offset = parseInt(searchParams.get('offset') || '0');
    const walletAddress = searchParams.get('wallet');

    // Public gallery: only approved memes. With wallet: show user's own memes (all statuses).
    let memes;
    if (walletAddress) {
      memes = await sql`
        SELECT id, image_data, template_name, wallet_address, approval_status, created_at
        FROM memes
        WHERE wallet_address = ${walletAddress}
        ORDER BY created_at DESC
        LIMIT ${limit} OFFSET ${offset}
      `;
    } else {
      memes = await sql`
        SELECT id, image_data, template_name, wallet_address, approval_status, created_at
        FROM memes
        WHERE approval_status = 'approved'
        ORDER BY created_at DESC
        LIMIT ${limit} OFFSET ${offset}
      `;
    }

    return NextResponse.json({ success: true, memes });
  } catch (error) {
    console.error('Error fetching memes:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch memes' },
      { status: 500 }
    );
  }
}

// POST - Save a new meme
export async function POST(request: NextRequest) {
  try {
    await initializeTable();

    const body = await request.json();
    const { imageData, templateName, layersJson, walletAddress } = body;

    if (!imageData) {
      return NextResponse.json(
        { success: false, error: 'Image data is required' },
        { status: 400 }
      );
    }

    const result = await sql`
      INSERT INTO memes (image_data, template_name, layers_json, wallet_address, approval_status)
      VALUES (${imageData}, ${templateName || null}, ${layersJson || null}, ${walletAddress || null}, 'pending')
      RETURNING id, created_at
    `;

    return NextResponse.json({
      success: true,
      meme: {
        id: result[0].id,
        created_at: result[0].created_at,
      }
    });
  } catch (error) {
    console.error('Error saving meme:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to save meme' },
      { status: 500 }
    );
  }
}

// DELETE - Delete a meme
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    const walletAddress = searchParams.get('wallet');

    if (!id) {
      return NextResponse.json(
        { success: false, error: 'Meme ID is required' },
        { status: 400 }
      );
    }

    // Only allow deletion by the creator
    if (walletAddress) {
      await sql`
        DELETE FROM memes
        WHERE id = ${parseInt(id)} AND wallet_address = ${walletAddress}
      `;
    } else {
      await sql`
        DELETE FROM memes WHERE id = ${parseInt(id)}
      `;
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting meme:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to delete meme' },
      { status: 500 }
    );
  }
}

import { neon } from '@neondatabase/serverless';
import { NextRequest, NextResponse } from 'next/server';
import { isAdminWallet } from '@/lib/admin';

const sql = neon(process.env.DATABASE_URL!);

function requireAdmin(request: NextRequest): string | null {
  const wallet = request.headers.get('x-admin-wallet');
  if (!wallet || !isAdminWallet(wallet)) {
    return null;
  }
  return wallet;
}

// GET - List all memes (including pending/denied) for admin
export async function GET(request: NextRequest) {
  const adminWallet = requireAdmin(request);
  if (!adminWallet) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status'); // pending | approved | denied | all
    const limit = parseInt(searchParams.get('limit') || '100');
    const offset = parseInt(searchParams.get('offset') || '0');

    let memes;
    if (status && status !== 'all') {
      memes = await sql`
        SELECT id, image_data, template_name, wallet_address, approval_status, created_at
        FROM memes
        WHERE approval_status = ${status}
        ORDER BY created_at DESC
        LIMIT ${limit} OFFSET ${offset}
      `;
    } else {
      memes = await sql`
        SELECT id, image_data, template_name, wallet_address, approval_status, created_at
        FROM memes
        ORDER BY created_at DESC
        LIMIT ${limit} OFFSET ${offset}
      `;
    }

    return NextResponse.json({ success: true, memes });
  } catch (error) {
    console.error('Admin memes GET error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch memes' },
      { status: 500 }
    );
  }
}

// PATCH - Approve or deny a meme
export async function PATCH(request: NextRequest) {
  const adminWallet = requireAdmin(request);
  if (!adminWallet) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { id, approval_status } = body;

    if (!id || !approval_status) {
      return NextResponse.json(
        { success: false, error: 'id and approval_status are required' },
        { status: 400 }
      );
    }

    const validStatus = ['approved', 'denied'];
    if (!validStatus.includes(approval_status)) {
      return NextResponse.json(
        { success: false, error: 'approval_status must be approved or denied' },
        { status: 400 }
      );
    }

    await sql`
      UPDATE memes
      SET approval_status = ${approval_status}
      WHERE id = ${parseInt(String(id))}
    `;

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Admin memes PATCH error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to update meme' },
      { status: 500 }
    );
  }
}

// DELETE - Delete a meme (admin can delete any)
export async function DELETE(request: NextRequest) {
  const adminWallet = requireAdmin(request);
  if (!adminWallet) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json(
        { success: false, error: 'id is required' },
        { status: 400 }
      );
    }

    await sql`
      DELETE FROM memes WHERE id = ${parseInt(id)}
    `;

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Admin memes DELETE error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to delete meme' },
      { status: 500 }
    );
  }
}

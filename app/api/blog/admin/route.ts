import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { createClient } from '@supabase/supabase-js'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

async function requireAdmin() {
  const { userId } = await auth()
  if (!userId) return null

  const supabase = getSupabase()
  const { data } = await supabase
    .from('subscribers')
    .select('role')
    .eq('clerk_id', userId)
    .single()

  if (data?.role !== 'admin') return null
  return userId
}

export async function GET() {
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const supabase = getSupabase()
  const { data } = await supabase
    .from('blog_posts')
    .select('*')
    .order('sort_order', { ascending: false })

  return NextResponse.json({ posts: data ?? [] })
}

export async function POST(req: NextRequest) {
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const supabase = getSupabase()
  const body = await req.json()
  const { id, slug, title, body: postBody, date_label, published, sort_order } = body

  if (!slug || !title || !postBody || !date_label) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  if (id) {
    const { data, error } = await supabase
      .from('blog_posts')
      .update({
        slug,
        title,
        body: postBody,
        date_label,
        published: published ?? false,
        sort_order: sort_order ?? 0,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ post: data })
  }

  const { data, error } = await supabase
    .from('blog_posts')
    .insert({
      slug,
      title,
      body: postBody,
      date_label,
      published: published ?? false,
      sort_order: sort_order ?? 0,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ post: data })
}

export async function DELETE(req: NextRequest) {
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await req.json()
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

  const supabase = getSupabase()
  const { error } = await supabase.from('blog_posts').delete().eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ deleted: true })
}

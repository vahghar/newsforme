import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import fs from 'fs';

// Fast API route to instantly serve pre-generated newspaper JSON
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const category = searchParams.get('category') || 'tech';

  try {
    const cacheDir = path.join(process.cwd(), 'cache');
    const filePath = path.join(cacheDir, `news-${category}.json`);

    // Check if the file exists
    if (!fs.existsSync(filePath)) {
      return NextResponse.json(
        { error: `Newspaper edition not ready for ${category}. Run the morning cache generator first.` },
        { status: 404 }
      );
    }

    // Read and parse directly to skip LLM generation wait times
    const fileOutput = fs.readFileSync(filePath, 'utf-8');
    const data = JSON.parse(fileOutput);

    return NextResponse.json(data);
  } catch (error: any) {
    console.error(`[cached-news/${category}] Error:`, error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

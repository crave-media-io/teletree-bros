const Anthropic = require('@anthropic-ai/sdk');
const { createClient } = require('@supabase/supabase-js');

// ═══════════════════════════════════════════════════════════════
//  PRICING CONFIGURATION — adjust these values as needed
// ═══════════════════════════════════════════════════════════════

const PRICING_CONFIG = {
  minimum: 2000,

  baseByHeight: [
    { label: 'Small',      minFt: 0,  maxFt: 30,  low: 2000,  high: 3000  },
    { label: 'Medium',     minFt: 30, maxFt: 60,  low: 2500,  high: 4500  },
    { label: 'Large',      minFt: 60, maxFt: 80,  low: 3500,  high: 6000  },
    { label: 'Very Large', minFt: 80, maxFt: 999, low: 5000,  high: 9000  },
  ],

  // Adjustments are ADDITIVE — percentages are summed then applied once to the base
  adjustments: {
    proximityToStructure: { min: 0.10, max: 0.20, label: 'Proximity to Structure' },
    powerLineProximity:   { min: 0.10, max: 0.15, label: 'Power Line Proximity' },
    limitedAccess:        { min: 0.05, max: 0.15, label: 'Limited Access' },
    hardwoodSpecies:      { min: 0.05, max: 0.10, label: 'Hardwood Species' },
    deadOrHazardous:      { min: 0.05, max: 0.10, label: 'Dead / Hazardous Tree' },
    emergency:            { min: 0.15, max: 0.30, label: 'Emergency Service' },
  },

  // Max total adjustment multiplier (e.g., 0.60 = base can increase by at most 60%)
  maxAdjustment: 0.60,

  crewHoursPerFoot: {
    softwood: 0.08,
    hardwood: 0.12,
  },

  baseCrewHours: 3,
};

// ═══════════════════════════════════════════════════════════════
//  INIT CLIENTS
// ═══════════════════════════════════════════════════════════════

const anthropic = new Anthropic();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// ═══════════════════════════════════════════════════════════════
//  CORS
// ═══════════════════════════════════════════════════════════════

function corsHeaders(origin) {
  const allowed = process.env.ALLOWED_ORIGINS || '*';
  const allowOrigin = allowed === '*' ? '*' :
    allowed.split(',').map(s => s.trim()).includes(origin) ? origin : '';
  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

// ═══════════════════════════════════════════════════════════════
//  CLAUDE ANALYSIS
// ═══════════════════════════════════════════════════════════════

function buildAnalysisPrompt(description, isEmergency) {
  return `You are a tree removal cost estimator for TeleTree Bros, a professional tree service company in North Georgia.

IMPORTANT CONTEXT ABOUT EQUIPMENT:
TeleTree Bros uses a Merlo Roto 50.35 telescopic crane (115-foot reach, 360-degree rotation) with a Woodcracker CS750 grapple saw. This system GRIPS each section of the tree before cutting, then lifts and places it precisely. There is NO free-fall of limbs. The crew operates primarily from the street or driveway, not from the tree itself. This means:
- Proximity to structures is LESS risky than traditional tree removal — limbs are secured, not dropped
- Access should be evaluated based on whether the crane can reach the tree from the street, driveway, or nearby clear area
- Only mark access as "difficult" if there is truly no way to position equipment within reach

HEIGHT ESTIMATION — USE REFERENCE OBJECTS:
Do NOT guess tree height in isolation. Use objects visible in the photo to calibrate:
- Standard garage door: ~7 ft tall
- Single-story house wall: ~9-10 ft (floor to eave)
- Two-story house: ~20-25 ft to the peak
- Full-size pickup truck: ~6 ft to cab roof, ~6.5 ft to roof rack
- Standard trash/recycling bin: ~3.5 ft tall
- Standard fence: ~4-6 ft tall
- Adult person: ~5.5-6 ft tall
- Standard door: ~6.8 ft tall
Compare the tree height against these references. Count how many "house heights" or "garage doors" tall the tree is. Be precise — most residential trees are 30-60 ft, not 60-80 ft. Overestimating height is a common error.

Analyze the provided tree photo(s) and the customer's description to assess the removal job.

Customer description: "${description}"
${isEmergency ? 'NOTE: The customer has flagged this as an EMERGENCY / dangerous situation.' : ''}

Return a JSON object with EXACTLY this structure (no markdown, no code fences, just raw JSON):
{
  "species": "Common name of the tree species",
  "speciesType": "hardwood" or "softwood",
  "estimatedHeightFt": number (best estimate of tree height in feet — USE REFERENCE OBJECTS),
  "heightReasoning": "Brief explanation of what reference objects you used to estimate height",
  "estimatedTrunkDiameterIn": number (estimated trunk diameter in inches at chest height),
  "canopyDescription": "Brief description of canopy size and density",
  "treeCondition": "healthy", "declining", "dead", or "hazardous",
  "proximityToStructure": {
    "detected": boolean,
    "severity": "none", "moderate", or "severe",
    "distanceFt": number or null,
    "description": "What structure and how close. Remember: the grapple saw system eliminates free-fall risk"
  },
  "powerLines": {
    "detected": boolean,
    "severity": "none", "moderate", or "severe",
    "description": "Description of power line situation"
  },
  "accessDifficulty": {
    "level": "easy", "moderate", or "difficult",
    "description": "Can the crane reach from street or driveway? If yes, access is easy"
  },
  "factors": [
    {
      "name": "Factor name",
      "impact": "high", "medium", or "low",
      "description": "Brief explanation"
    }
  ],
  "difficultyRating": "standard", "complex", or "high-complexity",
  "notes": "Any additional observations relevant to removal"
}

Be realistic and calibrated. Most residential jobs are "standard" difficulty. Only rate as "complex" when there are genuine complicating factors even WITH crane/grapple equipment. "high-complexity" should be rare — reserved for truly exceptional situations. The factors array should include 4-6 relevant factors. Always include tree size and cleanup as factors.`;
}

async function analyzeTree(photoUrls, description, isEmergency) {
  const content = [];

  for (const url of photoUrls) {
    content.push({
      type: 'image',
      source: { type: 'url', url },
    });
  }

  content.push({
    type: 'text',
    text: buildAnalysisPrompt(description, isEmergency),
  });

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1500,
    messages: [{ role: 'user', content }],
  });

  let text = response.content[0].text.trim();
  // Strip markdown code fences if present
  if (text.startsWith('```')) {
    text = text.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?\s*```$/, '');
  }
  return JSON.parse(text);
}

// ═══════════════════════════════════════════════════════════════
//  PRICING CALCULATION
// ═══════════════════════════════════════════════════════════════

function calculateEstimate(analysis, isEmergency) {
  const height = analysis.estimatedHeightFt || 40;
  const tier = PRICING_CONFIG.baseByHeight.find(t => height >= t.minFt && height < t.maxFt)
    || PRICING_CONFIG.baseByHeight[PRICING_CONFIG.baseByHeight.length - 1];

  const baseLow = tier.low;
  const baseHigh = tier.high;

  // Additive: sum all applicable adjustment percentages, then apply once
  let totalAdjLow = 0;
  let totalAdjHigh = 0;
  const appliedAdjustments = [];

  if (analysis.proximityToStructure?.detected && analysis.proximityToStructure.severity !== 'none') {
    const adj = PRICING_CONFIG.adjustments.proximityToStructure;
    const mult = analysis.proximityToStructure.severity === 'severe' ? adj.max : adj.min;
    totalAdjLow += adj.min;
    totalAdjHigh += mult;
    appliedAdjustments.push({ key: 'proximityToStructure', multiplier: mult });
  }

  if (analysis.powerLines?.detected && analysis.powerLines.severity !== 'none') {
    const adj = PRICING_CONFIG.adjustments.powerLineProximity;
    const mult = analysis.powerLines.severity === 'severe' ? adj.max : adj.min;
    totalAdjLow += adj.min;
    totalAdjHigh += mult;
    appliedAdjustments.push({ key: 'powerLineProximity', multiplier: mult });
  }

  if (analysis.accessDifficulty?.level === 'moderate' || analysis.accessDifficulty?.level === 'difficult') {
    const adj = PRICING_CONFIG.adjustments.limitedAccess;
    const mult = analysis.accessDifficulty.level === 'difficult' ? adj.max : adj.min;
    totalAdjLow += adj.min;
    totalAdjHigh += mult;
    appliedAdjustments.push({ key: 'limitedAccess', multiplier: mult });
  }

  if (analysis.speciesType === 'hardwood') {
    const adj = PRICING_CONFIG.adjustments.hardwoodSpecies;
    const mult = (adj.min + adj.max) / 2;
    totalAdjLow += adj.min;
    totalAdjHigh += mult;
    appliedAdjustments.push({ key: 'hardwoodSpecies', multiplier: mult });
  }

  if (analysis.treeCondition === 'dead' || analysis.treeCondition === 'hazardous') {
    const adj = PRICING_CONFIG.adjustments.deadOrHazardous;
    const mult = analysis.treeCondition === 'hazardous' ? adj.max : adj.min;
    totalAdjLow += adj.min;
    totalAdjHigh += mult;
    appliedAdjustments.push({ key: 'deadOrHazardous', multiplier: mult });
  }

  if (isEmergency) {
    const adj = PRICING_CONFIG.adjustments.emergency;
    const mult = (adj.min + adj.max) / 2;
    totalAdjLow += adj.min;
    totalAdjHigh += mult;
    appliedAdjustments.push({ key: 'emergency', multiplier: mult });
  }

  // Cap total adjustment
  totalAdjLow = Math.min(totalAdjLow, PRICING_CONFIG.maxAdjustment);
  totalAdjHigh = Math.min(totalAdjHigh, PRICING_CONFIG.maxAdjustment);

  let low = Math.round(baseLow * (1 + totalAdjLow));
  let high = Math.round(baseHigh * (1 + totalAdjHigh));

  low = Math.max(low, PRICING_CONFIG.minimum);
  high = Math.max(high, PRICING_CONFIG.minimum);

  // Round to nearest $100
  low = Math.round(low / 100) * 100;
  high = Math.round(high / 100) * 100;

  // Estimate crew hours
  const hoursPerFoot = analysis.speciesType === 'hardwood'
    ? PRICING_CONFIG.crewHoursPerFoot.hardwood
    : PRICING_CONFIG.crewHoursPerFoot.softwood;
  const rawHours = PRICING_CONFIG.baseCrewHours + (height * hoursPerFoot);
  const hoursLow = Math.max(3, Math.round(rawHours * 0.8));
  const hoursHigh = Math.round(rawHours * 1.3);

  return {
    priceLow: low,
    priceHigh: high,
    estimatedTimeLow: hoursLow,
    estimatedTimeHigh: hoursHigh,
    heightTier: tier.label,
    appliedAdjustments,
  };
}

// ═══════════════════════════════════════════════════════════════
//  EMAIL NOTIFICATION
// ═══════════════════════════════════════════════════════════════

async function sendNotificationEmail(submission, analysis, estimate) {
  const recipients = (process.env.NOTIFICATION_EMAIL || '')
    .split(',').map(e => e.trim()).filter(Boolean)
    .map(email => ({ email }));

  if (!recipients.length) return;

  const photosHtml = submission.photoUrls
    .map(url => `<img src="${url}" style="width:200px;height:200px;object-fit:cover;border-radius:8px;margin-right:8px;" />`)
    .join('');

  const factorsHtml = (analysis.factors || [])
    .map(f => `<tr><td style="padding:6px 12px;border-bottom:1px solid #eee;">${f.name}</td><td style="padding:6px 12px;border-bottom:1px solid #eee;text-align:center;font-weight:600;">${f.impact.toUpperCase()}</td></tr>`)
    .join('');

  const now = new Date().toLocaleString('en-US', { timeZone: 'America/New_York', dateStyle: 'full', timeStyle: 'short' });

  const html = `
    <div style="font-family:'Montserrat',Arial,sans-serif;max-width:640px;margin:0 auto;background:#ffffff;">
      <div style="background:#021D05;padding:28px 32px;text-align:center;">
        <h1 style="color:#86B43C;font-size:20px;margin:0;">New Estimate Request</h1>
        <p style="color:rgba(255,255,255,0.6);font-size:13px;margin:6px 0 0;">${now}</p>
      </div>

      <div style="padding:28px 32px;">
        ${submission.isEmergency ? '<div style="background:#FFF3E0;border-left:4px solid #FF6600;padding:12px 16px;margin-bottom:20px;font-weight:600;color:#e55c00;">⚠ EMERGENCY / DANGEROUS SITUATION</div>' : ''}

        <h2 style="color:#021D05;font-size:16px;margin-bottom:12px;">Customer</h2>
        <table style="width:100%;margin-bottom:24px;font-size:14px;">
          <tr><td style="padding:4px 0;color:#888;width:100px;">Name</td><td style="padding:4px 0;font-weight:600;">${submission.firstName} ${submission.lastName}</td></tr>
          <tr><td style="padding:4px 0;color:#888;">Email</td><td style="padding:4px 0;"><a href="mailto:${submission.email}" style="color:#096034;">${submission.email}</a></td></tr>
          <tr><td style="padding:4px 0;color:#888;">Phone</td><td style="padding:4px 0;"><a href="tel:${submission.phone}" style="color:#096034;">${submission.phone}</a></td></tr>
        </table>

        <h2 style="color:#021D05;font-size:16px;margin-bottom:12px;">Photos</h2>
        <div style="margin-bottom:24px;">${photosHtml}</div>

        <h2 style="color:#021D05;font-size:16px;margin-bottom:8px;">Customer Description</h2>
        <p style="font-size:14px;line-height:1.6;color:#333;margin-bottom:24px;padding:14px;background:#f7f9f4;border-radius:8px;">${submission.description}</p>

        <div style="background:#f7f9f4;border-radius:12px;padding:24px;margin-bottom:24px;">
          <h2 style="color:#021D05;font-size:16px;margin:0 0 16px;">Estimate Provided</h2>
          <div style="font-size:32px;font-weight:700;color:#021D05;margin-bottom:8px;">$${estimate.priceLow.toLocaleString()} – $${estimate.priceHigh.toLocaleString()}</div>
          <div style="font-size:13px;color:#888;margin-bottom:16px;">
            ${analysis.species || 'Unknown species'} · ${analysis.estimatedHeightFt || '?'} ft · ${analysis.difficultyRating || 'standard'} difficulty · ${estimate.estimatedTimeLow}–${estimate.estimatedTimeHigh} hours
          </div>
          <table style="width:100%;border-collapse:collapse;font-size:13px;">
            <thead><tr><th style="text-align:left;padding:8px 12px;background:#e8ebe4;border-radius:4px 0 0 0;">Factor</th><th style="text-align:center;padding:8px 12px;background:#e8ebe4;border-radius:0 4px 0 0;">Impact</th></tr></thead>
            <tbody>${factorsHtml}</tbody>
          </table>
        </div>
      </div>

      <div style="background:#021D05;padding:20px 32px;text-align:center;">
        <p style="color:rgba(255,255,255,0.5);font-size:11px;margin:0;">TeleTree Bros Estimate Tool · Powered by Crave Media</p>
      </div>
    </div>
  `;

  await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'api-key': process.env.BREVO_API_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      sender: { name: process.env.FROM_NAME || 'TeleTree Bros', email: process.env.FROM_EMAIL },
      to: recipients,
      subject: `${submission.isEmergency ? '🚨 EMERGENCY ' : ''}New Estimate: ${submission.firstName} ${submission.lastName} — ${analysis.species || 'Tree Removal'}`,
      htmlContent: html,
    }),
  });
}

// ═══════════════════════════════════════════════════════════════
//  HANDLER
// ═══════════════════════════════════════════════════════════════

const rateLimitMap = new Map();
const RATE_LIMIT = 5;
const RATE_WINDOW_MS = 60 * 60 * 1000;

module.exports = async function handler(req, res) {
  const headers = corsHeaders(req.headers.origin || '');
  Object.entries(headers).forEach(([k, v]) => res.setHeader(k, v));

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // Rate limiting
  const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || 'unknown';
  const now = Date.now();
  const windowStart = now - RATE_WINDOW_MS;
  const hits = (rateLimitMap.get(ip) || []).filter(t => t > windowStart);
  if (hits.length >= RATE_LIMIT) {
    return res.status(429).json({ error: 'Too many requests. Please try again later.' });
  }
  hits.push(now);
  rateLimitMap.set(ip, hits);

  try {
    const { firstName, lastName, email, phone, description, isEmergency, photoUrls, honeypot } = req.body;

    // Bot check
    if (honeypot) return res.status(200).json({ success: true });

    // Validation
    if (!firstName || !lastName || !email || !phone || !description) {
      return res.status(400).json({ error: 'All fields are required.' });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: 'Invalid email address.' });
    }
    if (!photoUrls || !photoUrls.length) {
      return res.status(400).json({ error: 'At least one photo is required.' });
    }

    // Analyze with Claude
    const analysis = await analyzeTree(photoUrls, description, isEmergency);

    // Calculate pricing
    const estimate = calculateEstimate(analysis, isEmergency);

    // Store in Supabase
    const { error: dbError } = await supabase.from('estimates').insert({
      first_name: firstName,
      last_name: lastName,
      email,
      phone,
      description,
      is_emergency: isEmergency || false,
      photo_urls: photoUrls,
      species: analysis.species,
      species_type: analysis.speciesType,
      estimated_height: `${analysis.estimatedHeightFt} ft`,
      estimated_time: `${estimate.estimatedTimeLow}–${estimate.estimatedTimeHigh} hours`,
      difficulty: analysis.difficultyRating,
      price_low: estimate.priceLow,
      price_high: estimate.priceHigh,
      factors: analysis.factors,
      raw_analysis: analysis,
    });

    if (dbError) console.error('Supabase insert error:', dbError);

    // Send notification email
    try {
      await sendNotificationEmail(
        { firstName, lastName, email, phone, description, isEmergency, photoUrls },
        analysis,
        estimate
      );
    } catch (emailErr) {
      console.error('Email send error:', emailErr);
    }

    // Return estimate to customer
    return res.status(200).json({
      species: analysis.species,
      speciesType: analysis.speciesType,
      estimatedHeightFt: analysis.estimatedHeightFt,
      canopyDescription: analysis.canopyDescription,
      treeCondition: analysis.treeCondition,
      difficultyRating: analysis.difficultyRating,
      estimatedTimeLow: estimate.estimatedTimeLow,
      estimatedTimeHigh: estimate.estimatedTimeHigh,
      priceLow: estimate.priceLow,
      priceHigh: estimate.priceHigh,
      heightTier: estimate.heightTier,
      factors: analysis.factors,
      notes: analysis.notes,
    });
  } catch (err) {
    console.error('Estimate submission error:', err);
    return res.status(500).json({ error: 'Something went wrong. Please try again or call us at (770) 652-4249.' });
  }
};

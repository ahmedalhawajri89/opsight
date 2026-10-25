<?php

declare(strict_types=1);

// The Vercel entry (vercel-php): every request vercel.json does not route
// elsewhere arrives here and goes on to Laravel as it would on any server.

require __DIR__.'/_runtime.php';

require __DIR__.'/../public/index.php';

<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/*
 * The morning brief (product track, phase C).
 *
 * On the user, because it is a personal choice like the language: one
 * owner reads it on WhatsApp at eight, a manager not at all. Off by default
 * — a message nobody asked for is the fastest way to get every later one
 * ignored.
 *
 * `brief_deliveries` is what makes "once a day" true. The scheduler runs
 * hourly and a deploy can run it twice; the unique (user, day) row means a
 * second run finds the day already done instead of sending again.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table): void {
            $table->boolean('morning_brief')->default(false)->after('numerals');
            $table->string('brief_channel', 16)->default('email')->after('morning_brief');
            // E.164, normalised on the way in (ADR-021). Separate from any
            // phone on a customer record: this is where the user wants it.
            $table->string('whatsapp_phone', 20)->nullable()->after('brief_channel');
        });

        Schema::create('brief_deliveries', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('business_id')->constrained('businesses')->cascadeOnDelete();
            $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
            // The business's own calendar day the brief was for.
            $table->date('brief_date');
            $table->string('channel', 16);
            $table->string('status', 16);
            $table->string('error', 500)->nullable();
            $table->timestamps();

            $table->unique(['user_id', 'brief_date']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('brief_deliveries');

        Schema::table('users', function (Blueprint $table): void {
            $table->dropColumn(['morning_brief', 'brief_channel', 'whatsapp_phone']);
        });
    }
};

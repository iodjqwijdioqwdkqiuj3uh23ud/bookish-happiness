const { 
    Client, 
    GatewayIntentBits, 
    SlashCommandBuilder, 
    ModalBuilder, 
    TextInputBuilder, 
    TextInputStyle, 
    ActionRowBuilder, 
    EmbedBuilder, 
    REST, 
    Routes 
} = require('discord.js');

const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers]
});

const TOKEN = 'process.env.DISCORD_TOKEN';
const CLIENT_ID = '1532602867364659330';

// 역할 이름 설정
const ROLE_1GUP = "1급 (현역)";
const ROLE_4GUP = "4급 (사회복무요원)";

// 1. 슬래시 명령어 등록
const commands = [
    new SlashCommandBuilder()
        .setName('신체검사')
        .setDescription('병무청 신체검사를 받습니다.'),
    new SlashCommandBuilder()
        .setName('관등성명')
        .setDescription('본인의 복무 정보를 확인합니다.')
];

const rest = new REST({ version: '10' }).setToken(TOKEN);

client.once('ready', async () => {
    console.log(`🟢 ${client.user.tag} 로그인 성공!`);
    try {
        await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands });
        console.log('✅ 슬래시 명령어 등록 완료!');
    } catch (error) {
        console.error(error);
    }
});

// 2. 명령어 및 모달 이벤트 처리
client.on('interactionCreate', async (interaction) => {
    
    // --- [슬래시 명령어 처리] ---
    if (interaction.isChatInputCommand()) {
        if (interaction.commandName === '신체검사') {
            const modal = new ModalBuilder()
                .setCustomId('military_exam_modal')
                .setTitle('👨‍⚕️ 병무청 신체검사 신청서');

            const careerInput = new TextInputBuilder()
                .setCustomId('career')
                .setLabel('운동 경력 및 체력 상태')
                .setPlaceholder('예: 3대 500, 축구선수 출신, 주 5회 헬스 등')
                .setStyle(TextInputStyle.Paragraph)
                .setRequired(true);

            const healthInput = new TextInputBuilder()
                .setCustomId('health')
                .setLabel('지병 및 신체 질환 (없으면 없음)')
                .setPlaceholder('예: 디스크, 시력 저하, 없음 등')
                .setValue('없음')
                .setStyle(TextInputStyle.Short)
                .setRequired(true);

            const row1 = new ActionRowBuilder().addComponents(careerInput);
            const row2 = new ActionRowBuilder().addComponents(healthInput);

            modal.addComponents(row1, row2);
            await interaction.showModal(modal);
        } 
        
        else if (interaction.commandName === '관등성명') {
            const member = interaction.member;
            const has1Gup = member.roles.cache.some(r => r.name === ROLE_1GUP);
            const has4Gup = member.roles.cache.some(r => r.name === ROLE_4GUP);

            let status = "미필 (신체검사 미수검자)";
            if (has1Gup) status = "1급 현역병";
            if (has4Gup) status = "4급 사회복무요원";

            const embed = new EmbedBuilder()
                .setTitle(`🪖 ${interaction.user.username} 장병의 관등성명`)
                .setColor(has1Gup ? 0x0099FF : (has4Gup ? 0xFFA500 : 0x808080))
                .addFields(
                    { name: '소속', value: interaction.guild.name, inline: true },
                    { name: '신분/판정', value: status, inline: true }
                )
                .setTimestamp();

            await interaction.reply({ embeds: [embed] });
        }
    }

    // --- [모달 제출 및 DM 발송 처리] ---
    if (interaction.isModalSubmit()) {
        if (interaction.customId === 'military_exam_modal') {
            const career = interaction.fields.getTextInputValue('career');
            const health = interaction.fields.getTextInputValue('health');

            const isHealthy = health.trim() === '없음' || career.includes('건강');
            const targetRoleName = isHealthy ? ROLE_1GUP : ROLE_4GUP;

            const role = interaction.guild.roles.cache.find(r => r.name === targetRoleName);

            if (!role) {
                return interaction.reply({ 
                    content: `❌ 서버에 \`${targetRoleName}\` 역할이 존재하지 않습니다. 관리자에게 승인을 요청하세요.`, 
                    ephemeral: true 
                });
            }

            try {
                // 1. 서버 역할 부여
                await interaction.member.roles.add(role);

                // 2. DM으로 전송할 입영/복무 통지서 임베드 작성
                const dmNoticeEmbed = new EmbedBuilder()
                    .setTitle('📜 [대한민국 병무청] 입영 / 복무 통지서')
                    .setDescription(`**${interaction.user.username}** 님, 신체검사 결과에 따른 통지서가 발송되었습니다.`)
                    .setColor(isHealthy ? 0x0055FF : 0xFF8800)
                    .addFields(
                        { name: '👤 성명', value: interaction.user.username, inline: true },
                        { name: '🏢 소속 부대/서버', value: interaction.guild.name, inline: true },
                        { name: '⚖️ 신체검사 판정', value: `**${targetRoleName}**`, inline: false },
                        { name: '📝 제출한 건강/체력 상태', value: `· 경력: ${career}\n· 질환: ${health}`, inline: false },
                        { name: '📌 안내사항', value: isHealthy 
                            ? '귀하는 1급 현역 입영 대상자입니다. 입대 일정에 맞춰 훈련소로 입영해주시기 바랍니다.' 
                            : '귀하는 4급 사회복무요원 소집 대상자입니다. 지정된 기관에서 복무를 시작해주시기 바랍니다.' }
                    )
                    .setFooter({ text: '대한민국 병무청 자동 통지 시스템' })
                    .setTimestamp();

                // 3. DM 발송 시도
                let dmSent = false;
                try {
                    await interaction.user.send({ embeds: [dmNoticeEmbed] });
                    dmSent = true;
                } catch (dmError) {
                    console.log(`[경고] 유저(${interaction.user.tag})에게 DM을 보낼 수 없습니다. (DM 차단됨)`);
                }

                // 4. 채널 답변 전송
                const channelReplyEmbed = new EmbedBuilder()
                    .setTitle('📋 신체검사 완료')
                    .setColor(isHealthy ? 0x00FF00 : 0xFF9900)
                    .setDescription(`<@${interaction.user.id}> 님의 신체검사가 완료되어 **${targetRoleName}** 역할이 부여되었습니다.`)
                    .addFields({
                        name: '📩 통지서 발송 상태',
                        value: dmSent 
                            ? '✅ **개인 DM으로 입영/복무 통지서가 전송되었습니다.**' 
                            : '⚠️ **DM이 닫혀 있어 통지서를 보내지 못했습니다.** (서버 개인 메시지 수신 허용을 확인해주세요)'
                    });

                await interaction.reply({ embeds: [channelReplyEmbed] });

            } catch (error) {
                console.error(error);
                await interaction.reply({ 
                    content: '❌ 봇 권한이 부족하여 역할을 부여하지 못했습니다. (봇의 역할 순위가 최상단인지 확인해 주세요)', 
                    ephemeral: true 
                });
            }
        }
    }
});

client.login(process.env.DISCORD_TOKEN);

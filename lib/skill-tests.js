// Basic-knowledge screening tests, 15 multiple-choice questions per field, in English and Spanish.
// Each row: [question EN, question ES, correct [EN, ES], wrong1, wrong2, wrong3]. The correct answer is always written first;
// options are shuffled per attempt, so the data order reveals nothing to applicants.
// These are general trade-knowledge screeners (not code or licensing exams). Have a qualified lead review them before relying on scores.

const BANKS = {
  'Tile setter': [
    ['Which trowel and technique suits large-format tile (15 inches or bigger)?', '¿Qué llana y técnica es adecuada para baldosa de gran formato (15 pulgadas o más)?',
      ['A 1/2 inch square-notch trowel with back-buttering', 'Una llana de muesca cuadrada de 1/2 pulgada con encolado en la parte trasera de la baldosa'], ['A 1/8 inch V-notch trowel with no back-buttering', 'Una llana de muesca en V de 1/8 pulgada sin encolar la parte trasera'], ['Mastic spread with a paint brush', 'Mastique extendido con una brocha'], ['A flat trowel, so the thinset is smooth', 'Una llana lisa para que el mortero quede liso']],
    ['What goes over cement backer board in a shower before tile is set?', '¿Qué se aplica sobre la placa de cemento en una ducha antes de colocar la baldosa?',
      ['A waterproofing membrane (sheet or liquid)', 'Una membrana impermeabilizante (en lámina o líquida)'], ['Nothing, cement board is waterproof by itself', 'Nada, la placa de cemento es impermeable por sí sola'], ['A coat of interior wall paint', 'Una capa de pintura para paredes interiores'], ['Silicone in the corners only', 'Silicona solo en las esquinas']],
    ['What is the minimum slope for a shower floor toward the drain?', '¿Cuál es la pendiente mínima del piso de una ducha hacia el desagüe?',
      ['1/4 inch per foot', '1/4 de pulgada por pie'], ['1/16 inch per foot', '1/16 de pulgada por pie'], ['1 inch per foot', '1 pulgada por pie'], ['None, the floor should be level', 'Ninguna, el piso debe estar nivelado']],
    ['What does "lippage" mean?', '¿Qué significa "lippage" (desnivel entre baldosas)?',
      ['One tile edge sitting higher than the neighboring tile', 'El borde de una baldosa más alto que el de la baldosa vecina'], ['Grout joints that are too wide', 'Juntas de lechada demasiado anchas'], ['A tile that cracked while cutting', 'Una baldosa que se rompió al cortar'], ['White powder that appears on grout', 'Polvo blanco que aparece en la lechada']],
    ['Where should flexible sealant (silicone or urethane) be used instead of grout?', '¿Dónde se debe usar sellador flexible (silicona o uretano) en lugar de lechada?',
      ['At changes of plane, such as where the wall meets the floor or the tub', 'En los cambios de plano, como donde la pared se une con el piso o la bañera'], ['In every joint between tiles', 'En todas las juntas entre baldosas'], ['Only on the tile face', 'Solo sobre la cara de la baldosa'], ['Nowhere, grout is always better', 'En ningún lugar, la lechada siempre es mejor']],
    ['When should sanded grout be used?', '¿Cuándo se debe usar lechada con arena?',
      ['For joints 1/8 inch wide or wider', 'En juntas de 1/8 de pulgada o más anchas'], ['Only for joints narrower than 1/16 inch', 'Solo en juntas más angostas que 1/16 de pulgada'], ['Only on polished glass tile', 'Solo en baldosa de vidrio pulido'], ['Never, it always scratches tile', 'Nunca, siempre raya la baldosa']],
    ['Which wall material is NOT suitable behind tile in a shower?', '¿Qué material de pared NO es adecuado detrás de la baldosa en una ducha?',
      ['Standard paper-faced drywall', 'Panel de yeso estándar con papel'], ['Cement backer board with a membrane', 'Placa de cemento con membrana'], ['Foam backer board with sealed seams', 'Placa de espuma con juntas selladas'], ['A mortar bed', 'Una cama de mortero']],
    ['How much thinset coverage should wet-area tile have under it?', '¿Cuánta cobertura de mortero debe tener la baldosa en áreas húmedas?',
      ['At least 95%', 'Al menos 95%'], ['About 50%', 'Alrededor de 50%'], ['Only the corners and center', 'Solo las esquinas y el centro'], ['About 25%', 'Alrededor de 25%']],
    ['How do you check a floor before setting large tile?', '¿Cómo revisa un piso antes de colocar baldosa grande?',
      ['Use a straightedge or long level and flatten high and low spots', 'Con una regla o nivel largo, y se corrigen los puntos altos y bajos'], ['Look at it from the doorway', 'Se mira desde la puerta'], ['Skip it, thinset fills any gap', 'Se omite, el mortero rellena cualquier hueco'], ['Check only the corners', 'Se revisan solo las esquinas']],
    ['Why must you wait before grouting new tile?', '¿Por qué hay que esperar antes de rejuntar la baldosa nueva?',
      ['The thinset must cure for the time on the manufacturer label', 'El mortero debe curar el tiempo indicado por el fabricante'], ['Grout works best on wet thinset', 'La lechada funciona mejor sobre mortero húmedo'], ['There is no reason to wait', 'No hay ninguna razón para esperar'], ['Tile must dry in the sun first', 'La baldosa debe secarse al sol primero']],
    ['Which blade is right for cutting porcelain on a wet saw?', '¿Qué disco es correcto para cortar porcelanato en una sierra de agua?',
      ['A continuous-rim or porcelain-rated diamond blade', 'Un disco de diamante de borde continuo o para porcelanato'], ['A carbide wood-cutting blade', 'Un disco de carburo para madera'], ['A dry abrasive masonry blade', 'Un disco abrasivo seco para mampostería'], ['A reciprocating saw blade', 'Una hoja de sierra reciprocante']],
    ['How should you plan the layout of a bathroom wall or floor?', '¿Cómo debe planear la distribución de una pared o piso de baño?',
      ['Find the center, dry-lay the pattern, and avoid thin sliver cuts at the edges', 'Buscar el centro, probar el patrón en seco y evitar cortes muy delgados en los bordes'], ['Start in a corner and see what is left at the end', 'Empezar en una esquina y ver qué queda al final'], ['Start at the door and guess', 'Empezar en la puerta y calcular a ojo'], ['Set tiles randomly', 'Colocar las baldosas al azar']],
    ['What is the main purpose of tile spacers?', '¿Cuál es el propósito principal de los separadores de baldosa?',
      ['To keep grout joints a consistent width', 'Mantener las juntas de lechada con un ancho uniforme'], ['To hold the tile on the wall permanently', 'Sostener la baldosa en la pared de forma permanente'], ['To measure room size', 'Medir el tamaño del cuarto'], ['To mix the thinset', 'Mezclar el mortero']],
    ['Which slip-resistance rating is commonly required for wet floor tile?', '¿Qué clasificación antideslizante se requiere comúnmente para baldosa de piso mojado?',
      ['A wet DCOF of 0.42 or higher', 'Un DCOF en mojado de 0.42 o mayor'], ['A wet DCOF of 0.10', 'Un DCOF en mojado de 0.10'], ['Polished and glossy is always safe', 'Pulida y brillante siempre es segura'], ['No rating matters in a bathroom', 'Ninguna clasificación importa en un baño']],
    ['How should the top of a shower curb be finished?', '¿Cómo debe terminarse la parte superior de un bordillo de ducha?',
      ['Sloped slightly toward the inside of the shower', 'Con una ligera pendiente hacia el interior de la ducha'], ['Sloped toward the bathroom floor', 'Con pendiente hacia el piso del baño'], ['Perfectly flat so water sits there', 'Perfectamente plano para que el agua se quede'], ['Slope does not matter', 'La pendiente no importa']]
  ],

  'Tile helper': [
    ['Which protective gear is needed when cutting tile?', '¿Qué equipo de protección se necesita al cortar baldosa?',
      ['Eye protection, a dust mask or respirator, and hearing protection', 'Protección para los ojos, mascarilla o respirador y protección para los oídos'], ['Sunglasses only', 'Solo lentes de sol'], ['Nothing if you are outside', 'Nada si se está al aire libre'], ['Open sandals and shorts', 'Sandalias abiertas y pantalones cortos']],
    ['Why is dry-cutting tile and cement board a health risk?', '¿Por qué es un riesgo para la salud cortar baldosa y placa de cemento en seco?',
      ['It creates fine silica dust that is harmful to breathe', 'Crea polvo fino de sílice que es dañino al respirar'], ['It makes the tile too hot to touch', 'Calienta demasiado la baldosa'], ['It is not a risk at all', 'No es un riesgo'], ['It only makes noise', 'Solo hace ruido']],
    ['What should you do when mixing thinset?', '¿Qué debe hacer al mezclar el mortero?',
      ['Follow the water ratio on the bag, let it rest a few minutes, then remix', 'Seguir la proporción de agua de la bolsa, dejar reposar unos minutos y volver a mezclar'], ['Add as much water as needed to make it runny', 'Agregar toda el agua necesaria para que quede líquido'], ['Add dish soap so it spreads easier', 'Agregar jabón para que se extienda más fácil'], ['Mix it dry and sprinkle it on the wall', 'Mezclarlo seco y espolvorearlo en la pared']],
    ['What is the safe way to lift a heavy box of tile?', '¿Cuál es la forma segura de levantar una caja pesada de baldosa?',
      ['Bend your knees, keep your back straight and ask for help if it is too heavy', 'Doblar las rodillas, mantener la espalda recta y pedir ayuda si pesa demasiado'], ['Bend at the waist and jerk it up', 'Doblar la cintura y levantarla de golpe'], ['Twist your body while lifting', 'Girar el cuerpo mientras se levanta'], ['Always lift alone to save time', 'Levantar siempre solo para ahorrar tiempo']],
    ['Why mix tiles from several boxes while installing?', '¿Por qué se mezclan baldosas de varias cajas al instalar?',
      ['To blend small color and shade differences', 'Para combinar pequeñas diferencias de color y tono'], ['To use up the boxes faster', 'Para terminar las cajas más rápido'], ['To save on thinset', 'Para ahorrar mortero'], ['It makes no difference', 'No hace ninguna diferencia']],
    ['Which tool spreads thinset in even ridges?', '¿Qué herramienta extiende el mortero en surcos uniformes?',
      ['A notched trowel', 'Una llana dentada'], ['A paint roller', 'Un rodillo de pintura'], ['A putty knife with no notches', 'Una espátula sin dientes'], ['A rubber mallet', 'Un mazo de goma']],
    ['What should you do about thinset smeared on the tile face?', '¿Qué debe hacer con el mortero que quedó sobre la cara de la baldosa?',
      ['Wipe it off right away with a damp sponge before it hardens', 'Limpiarlo de inmediato con una esponja húmeda antes de que endurezca'], ['Leave it, it will wear off', 'Dejarlo, se quitará solo'], ['Chip it off with a hammer after a week', 'Quitarlo con un martillo después de una semana'], ['Cover it with grout', 'Taparlo con lechada']],
    ['How do you clean grout haze from tile?', '¿Cómo se limpia el velo de lechada de la baldosa?',
      ['Once grout firms up, wipe with a damp sponge and rinse it often', 'Cuando la lechada se endurece un poco, pasar una esponja húmeda y enjuagarla seguido'], ['Scrub with a dry cloth right away while it is wet', 'Frotar con un trapo seco de inmediato cuando está mojada'], ['Wait a month and use a wire brush', 'Esperar un mes y usar un cepillo de alambre'], ['Pour bleach on it', 'Echarle cloro']],
    ['How should you protect a finished floor while working?', '¿Cómo se protege un piso terminado mientras se trabaja?',
      ['Cover it with drop cloths or protective board', 'Cubrirlo con lonas o tableros protectores'], ['Leave it uncovered, it can be cleaned later', 'Dejarlo descubierto, se limpia después'], ['Drag tools across it carefully', 'Arrastrar las herramientas con cuidado'], ['Put wet buckets directly on it', 'Poner cubetas mojadas directamente encima']],
    ['How is a rubber grout float held when pushing grout into joints?', '¿Cómo se sostiene la llana de goma al empujar la lechada en las juntas?',
      ['At about a 45 degree angle, working diagonally across the joints', 'A unos 45 grados, trabajando en diagonal sobre las juntas'], ['Flat against the tile, along the joints', 'Plana contra la baldosa, a lo largo de las juntas'], ['Straight up at 90 degrees', 'Derecha a 90 grados'], ['Held like a hammer', 'Sostenida como un martillo']],
    ['What should happen to tile spacers before grouting?', '¿Qué se debe hacer con los separadores antes de rejuntar?',
      ['They are removed', 'Se retiran'], ['They stay in and get grouted over', 'Se dejan y se cubren con lechada'], ['They are melted with a heat gun', 'Se derriten con una pistola de calor'], ['They are glued down', 'Se pegan']],
    ['How should leftover wet thinset or grout be disposed of?', '¿Cómo se debe desechar el mortero o la lechada sobrante húmedos?',
      ['Let it harden and put it in the trash; never wash it down a drain', 'Dejar que endurezca y tirarlo a la basura; nunca lavarlo por el desagüe'], ['Pour it down the tub drain', 'Verterlo por el desagüe de la bañera'], ['Flush it down the toilet', 'Tirarlo por el inodoro'], ['Dump it in the yard', 'Tirarlo en el jardín']],
    ['A tile is cut wrong. What should you do?', 'Una baldosa se cortó mal. ¿Qué debe hacer?',
      ['Tell the lead setter and set it aside; extra tile is ordered for waste', 'Avisar al instalador principal y apartarla; se pide baldosa extra para el desperdicio'], ['Hide it behind a fixture and say nothing', 'Esconderla detrás de un accesorio y no decir nada'], ['Use it anyway with a big grout joint', 'Usarla igual con una junta de lechada grande'], ['Throw it away and take a new tile from another room', 'Tirarla y tomar una baldosa nueva de otro cuarto']],
    ['Which saw makes long straight cuts in tile?', '¿Qué sierra hace cortes rectos largos en baldosa?',
      ['A wet saw', 'Una sierra de agua'], ['A chainsaw', 'Una motosierra'], ['A hand saw for wood', 'Un serrucho para madera'], ['A jigsaw with a wood blade', 'Una sierra caladora con hoja para madera']],
    ['A lead tile setter gives you an instruction you do not understand. What is best?', 'El instalador principal le da una instrucción que no entiende. ¿Qué es lo mejor?',
      ['Ask them to explain it before you start', 'Pedirle que se la explique antes de empezar'], ['Guess and hope it is right', 'Adivinar y esperar que esté bien'], ['Skip that task', 'Saltarse esa tarea'], ['Ask someone who is not on the job', 'Preguntar a alguien que no está en el trabajo']]
  ],

  'Remodeler / carpenter': [
    ['What is the standard stud spacing in most residential walls?', '¿Cuál es la separación estándar de los montantes en la mayoría de las paredes residenciales?',
      ['16 inches on center', '16 pulgadas entre centros'], ['4 inches on center', '4 pulgadas entre centros'], ['30 inches on center', '30 pulgadas entre centros'], ['There is no standard', 'No hay estándar']],
    ['What must you do before removing or cutting into a wall?', '¿Qué debe hacer antes de quitar o cortar una pared?',
      ['Find out whether it is load-bearing and what is inside it (pipes, wires)', 'Averiguar si es de carga y qué hay adentro (tuberías, cables)'], ['Nothing, all walls are the same', 'Nada, todas las paredes son iguales'], ['Cut a large hole to look inside', 'Cortar un agujero grande para mirar'], ['Remove the ceiling first', 'Quitar primero el techo']],
    ['The 3-4-5 method is used to check what?', '¿Para qué se usa el método 3-4-5?',
      ['A square (90 degree) corner', 'Una esquina a escuadra (90 grados)'], ['The weight of a wall', 'El peso de una pared'], ['Stud spacing', 'La separación de montantes'], ['The slope of a drain', 'La pendiente de un desagüe']],
    ['Which fasteners suit pressure-treated lumber?', '¿Qué sujetadores son adecuados para madera tratada a presión?',
      ['Hot-dipped galvanized or stainless steel', 'Galvanizados por inmersión en caliente o de acero inoxidable'], ['Plain uncoated steel nails', 'Clavos de acero sin recubrimiento'], ['Staples only', 'Solo grapas'], ['Any fastener works the same', 'Cualquier sujetador funciona igual']],
    ['What is correct behind a tiled tub or shower wall?', '¿Qué es correcto detrás de una pared de bañera o ducha con baldosa?',
      ['Cement board or foam backer with a waterproofing system', 'Placa de cemento o espuma con un sistema impermeable'], ['Regular drywall painted with primer', 'Panel de yeso común pintado con imprimación'], ['Plain plywood', 'Madera contrachapada sin tratar'], ['Cardboard', 'Cartón']],
    ['What is a common minimum subfloor in a bathroom?', '¿Cuál es un subpiso mínimo común en un baño?',
      ['3/4 inch tongue-and-groove plywood, glued and screwed', 'Madera contrachapada machihembrada de 3/4 de pulgada, pegada y atornillada'], ['1/4 inch hardboard', 'Tablero duro de 1/4 de pulgada'], ['Foam sheets', 'Láminas de espuma'], ['Cardboard underlayment', 'Base de cartón']],
    ['Why add solid blocking inside a wall during framing?', '¿Por qué se agrega bloqueo sólido dentro de una pared durante el armado?',
      ['To securely anchor grab bars, vanities and shelves later', 'Para anclar con firmeza barras de apoyo, tocadores y repisas después'], ['To make the wall heavier', 'Para hacer la pared más pesada'], ['To hide wires', 'Para esconder cables'], ['It is only for decoration', 'Solo es decorativo']],
    ['Where should you avoid cutting large notches or holes in a floor joist?', '¿Dónde se deben evitar muescas o agujeros grandes en una viga de piso?',
      ['The middle third of the span', 'En el tercio central del tramo'], ['Near the ends only', 'Solo cerca de los extremos'], ['It is fine anywhere', 'Está bien en cualquier lugar'], ['Only at the top edge', 'Solo en el borde superior']],
    ['How are inside corners of crown or base molding usually joined for a tight fit?', '¿Cómo se unen normalmente las esquinas interiores de molduras para un ajuste firme?',
      ['Coped joints', 'Con cortes de copia (cope)'], ['Butted with a big gap and caulk', 'A tope con un hueco grande y sellador'], ['Overlapped', 'Superpuestas'], ['Taped together', 'Pegadas con cinta']],
    ['What is the difference between level and plumb?', '¿Cuál es la diferencia entre nivel y plomo?',
      ['Level is horizontal, plumb is vertical', 'Nivel es horizontal y plomo es vertical'], ['They mean the same thing', 'Significan lo mismo'], ['Level is vertical, plumb is horizontal', 'Nivel es vertical y plomo es horizontal'], ['Both refer to wall thickness', 'Ambos se refieren al grosor de la pared']],
    ['What is the standard toilet rough-in distance?', '¿Cuál es la distancia estándar de instalación (rough-in) de un inodoro?',
      ['12 inches from the finished wall to the center of the drain', '12 pulgadas desde la pared terminada hasta el centro del desagüe'], ['2 inches', '2 pulgadas'], ['30 inches', '30 pulgadas'], ['It varies by day', 'Varía según el día']],
    ['What is a typical vanity height range?', '¿Cuál es un rango típico de altura de un tocador?',
      ['About 32 to 36 inches', 'Aproximadamente de 32 a 36 pulgadas'], ['About 12 inches', 'Aproximadamente 12 pulgadas'], ['About 60 inches', 'Aproximadamente 60 pulgadas'], ['About 8 inches', 'Aproximadamente 8 pulgadas']],
    ['A home was built before 1978 and you will disturb old paint. What applies?', 'Una casa se construyó antes de 1978 y va a alterar pintura vieja. ¿Qué aplica?',
      ['Lead-safe work practices (EPA RRP rules) must be followed', 'Se deben seguir prácticas seguras contra el plomo (reglas EPA RRP)'], ['Nothing special', 'Nada especial'], ['Dry-sand it quickly to finish faster', 'Lijar en seco rápidamente para terminar antes'], ['Burn it off', 'Quemarla']],
    ['You find suspect old flooring or popcorn ceiling material. What do you do?', 'Encuentra material sospechoso de piso viejo o techo de palomitas. ¿Qué hace?',
      ['Stop work and have it tested for asbestos before disturbing it', 'Detener el trabajo y hacerlo analizar por asbesto antes de alterarlo'], ['Keep sanding', 'Seguir lijando'], ['Sweep it with a dry broom', 'Barrerlo con una escoba seca'], ['Blow it clean with compressed air', 'Soplarlo con aire comprimido']],
    ['How should a circular saw blade depth be set?', '¿Cómo se debe ajustar la profundidad del disco de una sierra circular?',
      ['About 1/4 inch deeper than the material being cut', 'Aproximadamente 1/4 de pulgada más profundo que el material a cortar'], ['As deep as possible', 'Lo más profundo posible'], ['Not at all, it does not matter', 'No se ajusta, no importa'], ['Below the material by several inches', 'Varias pulgadas por debajo del material']]
  ],

  Plumber: [
    ['What is the main job of a plumbing vent?', '¿Cuál es la función principal de una ventilación de plomería?',
      ['Let air in so drains flow and traps are not siphoned', 'Dejar entrar aire para que los desagües fluyan y no se succionen los sifones'], ['Add hot water', 'Agregar agua caliente'], ['Increase water pressure', 'Aumentar la presión del agua'], ['Heat the pipes', 'Calentar las tuberías']],
    ['What does a P-trap do?', '¿Qué hace un sifón en P?',
      ['Holds water that blocks sewer gas from entering the room', 'Retiene agua que impide que los gases del alcantarillado entren al cuarto'], ['Catches rings and jewelry only', 'Solo atrapa anillos y joyas'], ['Filters drinking water', 'Filtra el agua potable'], ['Speeds up draining', 'Acelera el desagüe']],
    ['What is the typical minimum slope for a horizontal drain pipe?', '¿Cuál es la pendiente mínima típica de un tubo de desagüe horizontal?',
      ['1/4 inch per foot', '1/4 de pulgada por pie'], ['1 inch per foot', '1 pulgada por pie'], ['No slope', 'Sin pendiente'], ['Slope uphill', 'Pendiente hacia arriba']],
    ['What is the minimum drain size for a toilet?', '¿Cuál es el tamaño mínimo de desagüe para un inodoro?',
      ['3 inches', '3 pulgadas'], ['1/2 inch', '1/2 pulgada'], ['1 inch', '1 pulgada'], ['1.25 inches', '1.25 pulgadas']],
    ['What are common drain sizes for a tub and a shower?', '¿Cuáles son los tamaños comunes de desagüe de una bañera y una ducha?',
      ['1.5 inches for a tub and 2 inches for a shower', '1.5 pulgadas para bañera y 2 pulgadas para ducha'], ['4 inches for both', '4 pulgadas para ambos'], ['1/2 inch for both', '1/2 pulgada para ambos'], ['3/4 inch for both', '3/4 de pulgada para ambos']],
    ['How are PEX pipes joined?', '¿Cómo se unen las tuberías PEX?',
      ['With crimp, clamp or expansion fittings made for PEX', 'Con accesorios de crimpado, abrazadera o expansión hechos para PEX'], ['With PVC cement', 'Con cemento para PVC'], ['With duct tape', 'Con cinta adhesiva'], ['By soldering with a torch', 'Soldando con soplete']],
    ['What is important when soldering copper water pipe?', '¿Qué es importante al soldar tubería de cobre para agua?',
      ['Clean the pipe, use flux and lead-free solder, and heat the fitting', 'Limpiar el tubo, usar fundente y soldadura sin plomo, y calentar el accesorio'], ['Use leaded solder for strength', 'Usar soldadura con plomo para mayor resistencia'], ['Heat the solder directly with the flame', 'Calentar la soldadura directamente con la llama'], ['Solder with the water still running', 'Soldar con el agua corriendo']],
    ['What do you do before cutting into a water supply line?', '¿Qué hace antes de cortar una línea de suministro de agua?',
      ['Shut off the water, then open a faucet to drain the line', 'Cerrar el agua y abrir una llave para vaciar la línea'], ['Cut it, then look for the shutoff', 'Cortarla y luego buscar la llave de paso'], ['Turn the water pressure up', 'Subir la presión del agua'], ['Nothing', 'Nada']],
    ['How do you join PVC and ABS pipe?', '¿Cómo se unen tubos de PVC y ABS?',
      ['Use the right cement for each, or transition cement made for joining them', 'Usar el cemento correcto para cada uno, o cemento de transición hecho para unirlos'], ['Any glue works', 'Cualquier pegamento sirve'], ['Wrap with tape', 'Envolver con cinta'], ['They cannot be joined', 'No se pueden unir']],
    ['What must you never do to a water heater temperature and pressure (T&P) relief valve?', '¿Qué nunca se debe hacer con la válvula de alivio de temperatura y presión (T&P) de un calentador de agua?',
      ['Plug or cap it', 'Taparla o ponerle un tapón'], ['Pipe it to a safe discharge location', 'Conectarla a un punto de descarga seguro'], ['Test it as the manufacturer says', 'Probarla como indica el fabricante'], ['Install it per code', 'Instalarla según el código']],
    ['What is a typical shower valve height above the floor?', '¿Cuál es una altura típica de la válvula de ducha sobre el piso?',
      ['About 48 inches', 'Aproximadamente 48 pulgadas'], ['About 6 inches', 'Aproximadamente 6 pulgadas'], ['About 90 inches', 'Aproximadamente 90 pulgadas'], ['At floor level', 'A nivel del piso']],
    ['What is a normal residential water pressure range?', '¿Cuál es un rango normal de presión de agua residencial?',
      ['About 40 to 80 psi', 'Aproximadamente de 40 a 80 psi'], ['About 1 to 5 psi', 'Aproximadamente de 1 a 5 psi'], ['About 200 to 400 psi', 'Aproximadamente de 200 a 400 psi'], ['0 psi', '0 psi']],
    ['What does a backflow preventer or air gap protect against?', '¿Contra qué protege un dispositivo antirretorno o una brecha de aire?',
      ['Dirty water flowing back into the clean drinking supply', 'Que el agua sucia regrese al suministro de agua potable'], ['Low water pressure', 'La baja presión de agua'], ['Frozen pipes', 'Las tuberías congeladas'], ['Noisy pipes', 'Las tuberías ruidosas']],
    ['What is the usual minimum clearance from a toilet centerline to a side wall or tub?', '¿Cuál es la separación mínima habitual del eje del inodoro a una pared lateral o bañera?',
      ['15 inches', '15 pulgadas'], ['3 inches', '3 pulgadas'], ['40 inches', '40 pulgadas'], ['1 inch', '1 pulgada']],
    ['Why pressure test new supply lines before closing the walls?', '¿Por qué se prueba a presión las líneas de suministro nuevas antes de cerrar las paredes?',
      ['To find leaks while repairs are easy and cheap', 'Para encontrar fugas cuando reparar es fácil y barato'], ['To warm the pipes', 'Para calentar las tuberías'], ['It is never necessary', 'Nunca es necesario'], ['To make the pipes stronger', 'Para hacer las tuberías más fuertes']]
  ],

  Electrician: [
    ['Which bathroom receptacles require GFCI protection?', '¿Qué tomacorrientes de baño requieren protección GFCI?',
      ['All of them', 'Todos'], ['Only the one by the sink', 'Solo el que está junto al lavabo'], ['None', 'Ninguno'], ['Only those over 6 feet high', 'Solo los que están a más de 6 pies de altura']],
    ['What copper wire size is normally used on a 20-amp circuit?', '¿Qué calibre de cable de cobre se usa normalmente en un circuito de 20 amperios?',
      ['12 AWG', '12 AWG'], ['18 AWG', '18 AWG'], ['14 AWG only', 'Solo 14 AWG'], ['6 AWG', '6 AWG']],
    ['What copper wire size is normally used on a 15-amp circuit?', '¿Qué calibre de cable de cobre se usa normalmente en un circuito de 15 amperios?',
      ['14 AWG', '14 AWG'], ['18 AWG', '18 AWG'], ['10 AWG', '10 AWG'], ['Speaker wire', 'Cable de bocina']],
    ['What circuit is required for bathroom receptacles under the NEC?', '¿Qué circuito exige el NEC para los tomacorrientes del baño?',
      ['A 20-amp circuit', 'Un circuito de 20 amperios'], ['A 5-amp circuit', 'Un circuito de 5 amperios'], ['A 60-amp circuit', 'Un circuito de 60 amperios'], ['Any circuit shared with the oven', 'Cualquier circuito compartido con el horno']],
    ['What are the standard color roles for hot, neutral and ground?', '¿Cuáles son los colores estándar para vivo, neutro y tierra?',
      ['Black or red = hot, white = neutral, green or bare = ground', 'Negro o rojo = vivo, blanco = neutro, verde o desnudo = tierra'], ['White = hot, black = neutral, red = ground', 'Blanco = vivo, negro = neutro, rojo = tierra'], ['Green = hot, white = ground', 'Verde = vivo, blanco = tierra'], ['Colors never matter', 'Los colores nunca importan']],
    ['What is the safe first step before working on a circuit?', '¿Cuál es el primer paso seguro antes de trabajar en un circuito?',
      ['Turn off and lock out the breaker, then test that the wires are dead', 'Apagar y bloquear el interruptor, y comprobar que los cables no tienen corriente'], ['Switch off the wall switch only', 'Apagar solo el interruptor de pared'], ['Work carefully with it live', 'Trabajar con cuidado con corriente'], ['Wear rubber sandals and hope', 'Usar sandalias de goma y esperar lo mejor']],
    ['What rating must a light fixture have inside a shower area?', '¿Qué clasificación debe tener una luminaria dentro de una ducha?',
      ['Rated for wet (or damp) locations as marked on the fixture', 'Aprobada para lugares húmedos o mojados según la marca de la luminaria'], ['Any fixture is fine', 'Cualquier luminaria sirve'], ['Indoor dry-only rated', 'Solo para interiores secos'], ['A decorative lamp with no label', 'Una lámpara decorativa sin etiqueta']],
    ['How many watts does a 120-volt, 15-amp circuit supply at maximum?', '¿Cuántos vatios suministra como máximo un circuito de 120 voltios y 15 amperios?',
      ['1,800 watts', '1,800 vatios'], ['135 watts', '135 vatios'], ['18,000 watts', '18,000 vatios'], ['12 watts', '12 vatios']],
    ['What is the usual limit for a continuous load on a breaker?', '¿Cuál es el límite habitual de una carga continua en un interruptor?',
      ['80% of the breaker rating', '80% de la capacidad del interruptor'], ['150% of the rating', '150% de la capacidad'], ['200% of the rating', '200% de la capacidad'], ['There is no limit', 'No hay límite']],
    ['What is the purpose of equipment grounding?', '¿Cuál es el propósito de la puesta a tierra del equipo?',
      ['To give fault current a safe path so the breaker trips', 'Dar a la corriente de falla un camino seguro para que el interruptor se dispare'], ['To make lights brighter', 'Hacer las luces más brillantes'], ['To lower the power bill', 'Bajar la factura de electricidad'], ['To store electricity', 'Almacenar electricidad']],
    ['What does a three-way switch setup allow?', '¿Qué permite una instalación de interruptor de tres vías?',
      ['Controlling one light from two locations', 'Controlar una luz desde dos lugares'], ['Controlling three lights from one place', 'Controlar tres luces desde un lugar'], ['Dimming the light', 'Atenuar la luz'], ['Running the light on 3 volts', 'Hacer funcionar la luz con 3 voltios']],
    ['Where must a bathroom exhaust fan vent?', '¿Hacia dónde debe ventilar un extractor de baño?',
      ['To the outdoors', 'Hacia el exterior'], ['Into the attic', 'Hacia el ático'], ['Into the wall cavity', 'Hacia el interior de la pared'], ['Into the ceiling space above the room', 'Hacia el espacio sobre el techo del cuarto']],
    ['What makes a good wire-nut connection?', '¿Qué hace buena una conexión con conector de rosca?',
      ['Strip the right length, twist the wire nut on tight and tug-test each wire', 'Pelar la longitud correcta, apretar bien el conector y jalar cada cable para probarlo'], ['Twist the bare wires loosely and tape them', 'Torcer los cables sin apretar y cubrirlos con cinta'], ['Leave the copper exposed', 'Dejar el cobre expuesto'], ['Use a wire nut on one wire only', 'Usar un conector con un solo cable']],
    ['What is Ohm\'s law?', '¿Qué es la ley de Ohm?',
      ['Voltage = current x resistance (V = I x R)', 'Voltaje = corriente x resistencia (V = I x R)'], ['Power = time x distance', 'Potencia = tiempo x distancia'], ['Current = voltage + resistance', 'Corriente = voltaje + resistencia'], ['Resistance = watts x 2', 'Resistencia = vatios x 2']],
    ['Do most city electrical jobs need a permit and inspection?', '¿La mayoría de los trabajos eléctricos en las ciudades requieren permiso e inspección?',
      ['Yes, usually, and a licensed electrician where the city requires one', 'Sí, normalmente, y un electricista con licencia donde la ciudad lo exija'], ['Never', 'Nunca'], ['Only for work on the exterior', 'Solo para trabajo exterior'], ['Only if the homeowner asks', 'Solo si el propietario lo pide']]
  ],

  'Painter / finisher': [
    ['What are the basic steps of good paint prep?', '¿Cuáles son los pasos básicos de una buena preparación para pintar?',
      ['Clean, fill and sand, then prime where needed', 'Limpiar, rellenar y lijar, y luego imprimar donde haga falta'], ['Paint directly over dirt and holes', 'Pintar directamente sobre suciedad y agujeros'], ['Only wipe with a dry cloth', 'Solo pasar un trapo seco'], ['Skip taping and cover nothing', 'No cubrir ni enmascarar nada']],
    ['Which paint is best for a bathroom wall?', '¿Qué pintura es mejor para una pared de baño?',
      ['A mildew-resistant satin or semi-gloss paint', 'Una pintura satinada o semibrillante resistente al moho'], ['Flat ceiling paint', 'Pintura mate para techos'], ['Chalk paint', 'Pintura de tiza'], ['Watercolor', 'Acuarela']],
    ['What is primer mainly for?', '¿Para qué sirve principalmente la imprimación?',
      ['Sealing the surface and helping paint stick and cover evenly', 'Sellar la superficie y ayudar a que la pintura se adhiera y cubra parejo'], ['Making paint thinner', 'Diluir la pintura'], ['Cleaning the brush', 'Limpiar la brocha'], ['Nothing, it is optional decoration', 'Nada, es decorativa y opcional']],
    ['How do you clean latex paint from brushes?', '¿Cómo se limpia la pintura de látex de las brochas?',
      ['With warm water and soap', 'Con agua tibia y jabón'], ['With gasoline', 'Con gasolina'], ['They cannot be cleaned', 'No se pueden limpiar'], ['With mineral spirits only', 'Solo con aguarrás']],
    ['Which caulk is best at the tub and shower joints?', '¿Qué sellador es mejor en las juntas de bañera y ducha?',
      ['100% silicone made for kitchens and baths', 'Silicona 100% hecha para cocinas y baños'], ['Paintable acrylic with no mildew protection', 'Acrílico pintable sin protección contra el moho'], ['Wood glue', 'Pegamento para madera'], ['Spray foam', 'Espuma en aerosol']],
    ['What does "cutting in" mean?', '¿Qué significa "cutting in" (perfilar)?',
      ['Painting edges and corners with a brush before rolling', 'Pintar bordes y esquinas con brocha antes de usar el rodillo'], ['Cutting the paint can open', 'Cortar el bote de pintura'], ['Cutting trim off the wall', 'Cortar el moldeado de la pared'], ['Painting with a spray gun only', 'Pintar solo con pistola']],
    ['When should painter\'s tape be removed?', '¿Cuándo se debe quitar la cinta de pintor?',
      ['When the paint is dry to the touch, pulling slowly at an angle', 'Cuando la pintura está seca al tacto, jalando despacio en ángulo'], ['A month after painting', 'Un mes después de pintar'], ['Never', 'Nunca'], ['While the paint is soaking wet', 'Mientras la pintura está empapada']],
    ['What is the fire risk with oil-soaked rags?', '¿Cuál es el riesgo de incendio con trapos empapados de aceite?',
      ['They can heat up and ignite on their own; dry them flat or store in water in a metal can', 'Pueden calentarse y encenderse solos; secarlos extendidos o guardarlos en agua en un bote metálico'], ['None', 'Ninguno'], ['Only if wet', 'Solo si están mojados'], ['They freeze', 'Se congelan']],
    ['In a home built before 1978, what applies when disturbing old paint?', 'En una casa construida antes de 1978, ¿qué aplica al alterar pintura vieja?',
      ['Lead-safe practices; never dry-sand or scrape without precautions', 'Prácticas seguras contra el plomo; nunca lijar o raspar en seco sin precauciones'], ['Nothing', 'Nada'], ['Sand quickly in dry form', 'Lijar rápido en seco'], ['Use a leaf blower', 'Usar un soplador de hojas']],
    ['What covers up water stains or smoke stains so they do not bleed through?', '¿Qué cubre manchas de agua o humo para que no traspasen la pintura?',
      ['A stain-blocking primer', 'Una imprimación bloqueadora de manchas'], ['One extra coat of flat paint', 'Una capa extra de pintura mate'], ['Water', 'Agua'], ['Nothing works', 'Nada funciona']],
    ['What roller nap is usually good for smooth walls?', '¿Qué grosor de felpa de rodillo suele ser bueno para paredes lisas?',
      ['About 3/8 inch', 'Aproximadamente 3/8 de pulgada'], ['1.5 inches', '1.5 pulgadas'], ['2 inches', '2 pulgadas'], ['No roller needed', 'No se necesita rodillo']],
    ['Why follow the recoat time on the paint can?', '¿Por qué seguir el tiempo de repintado de la lata de pintura?',
      ['Recoating too soon can cause streaks, peeling or poor adhesion', 'Repintar demasiado pronto puede causar marcas, descascarado o mala adherencia'], ['It does not matter', 'No importa'], ['Paint dries in seconds', 'La pintura seca en segundos'], ['Only for marketing', 'Solo es publicidad']],
    ['What should you do about ventilation while painting indoors?', '¿Qué debe hacer con la ventilación al pintar en interiores?',
      ['Open windows or use fans to bring in fresh air', 'Abrir ventanas o usar ventiladores para que entre aire fresco'], ['Seal the room', 'Sellar el cuarto'], ['Turn the heat up high', 'Subir mucho la calefacción'], ['Nothing, fumes are harmless', 'Nada, los vapores son inofensivos']],
    ['How does paint sheen affect imperfections on walls?', '¿Cómo afecta el brillo de la pintura a las imperfecciones de la pared?',
      ['Higher gloss shows more flaws but wipes clean more easily', 'Más brillo muestra más defectos pero se limpia más fácil'], ['Gloss hides all flaws', 'El brillo oculta todos los defectos'], ['Sheen has no effect', 'El brillo no tiene efecto'], ['Flat paint is the most washable', 'La pintura mate es la más lavable']],
    ['Which sandpaper grit is typical for final sanding before painting drywall?', '¿Qué grano de lija es típico para el lijado final antes de pintar paneles de yeso?',
      ['About 150 to 220 grit', 'Aproximadamente de 150 a 220'], ['20 grit', '20'], ['40 grit', '40'], ['No sanding is ever done', 'Nunca se lija']]
  ],

  Drywall: [
    ['What thickness of drywall is standard for most home walls?', '¿Qué espesor de panel de yeso es estándar para la mayoría de las paredes de casa?',
      ['1/2 inch', '1/2 pulgada'], ['1/16 inch', '1/16 de pulgada'], ['2 inches', '2 pulgadas'], ['1/32 inch', '1/32 de pulgada']],
    ['How should drywall screws sit when driven?', '¿Cómo deben quedar los tornillos al atornillar panel de yeso?',
      ['Slightly below the paper surface without tearing it', 'Ligeramente por debajo de la superficie del papel sin romperlo'], ['Sticking out of the board', 'Sobresaliendo del panel'], ['Driven all the way through the paper', 'Atravesando por completo el papel'], ['Only one screw per sheet', 'Solo un tornillo por panel']],
    ['How many coats of joint compound are usually applied over tape?', '¿Cuántas capas de compuesto para juntas se aplican normalmente sobre la cinta?',
      ['Three coats, each feathered wider', 'Tres capas, cada una difuminada más ancha'], ['One thick coat', 'Una sola capa gruesa'], ['Ten coats', 'Diez capas'], ['None, tape alone is enough', 'Ninguna, la cinta sola basta']],
    ['Can moisture-resistant drywall be used directly as tile backer in a shower?', '¿Se puede usar panel de yeso resistente a la humedad directamente como base de baldosa en una ducha?',
      ['No, use cement board or an approved backer and waterproofing', 'No, usar placa de cemento o base aprobada con impermeabilización'], ['Yes, it is always fine', 'Sí, siempre está bien'], ['Yes, if painted twice', 'Sí, si se pinta dos veces'], ['Yes, with duct tape on the seams', 'Sí, con cinta adhesiva en las juntas']],
    ['Where is fire-rated Type X (5/8 inch) drywall commonly required?', '¿Dónde se exige comúnmente panel de yeso resistente al fuego Tipo X (5/8 de pulgada)?',
      ['Garage walls and ceilings shared with living space', 'Paredes y techos de garaje compartidos con la vivienda'], ['Only inside closets', 'Solo dentro de clósets'], ['Nowhere', 'En ningún lugar'], ['Only on exterior siding', 'Solo en el revestimiento exterior']],
    ['In what order is drywall usually hung?', '¿En qué orden se suele colocar el panel de yeso?',
      ['Ceilings first, then walls', 'Primero los techos y luego las paredes'], ['Walls first, then ceilings', 'Primero las paredes y luego los techos'], ['Order does not matter', 'El orden no importa'], ['Floors first', 'Primero los pisos']],
    ['How do you cut a sheet of drywall?', '¿Cómo se corta una hoja de panel de yeso?',
      ['Score the paper with a utility knife, snap it, then cut the back paper', 'Marcar el papel con una cuchilla, doblar para romper y cortar el papel trasero'], ['Break it with a hammer', 'Romperla con un martillo'], ['Use a wet saw', 'Usar una sierra de agua'], ['Burn it', 'Quemarla']],
    ['Which edge of drywall sheets makes taping joints easiest?', '¿Qué borde de las hojas de panel de yeso facilita más el emplaste de juntas?',
      ['The tapered edge', 'El borde rebajado (biselado)'], ['Cut ends (butt joints)', 'Los extremos cortados (juntas a tope)'], ['Edges that are broken', 'Los bordes rotos'], ['It makes no difference', 'No hay diferencia']],
    ['What protection should you use while sanding joint compound?', '¿Qué protección debe usar al lijar el compuesto para juntas?',
      ['A respirator or dust mask and eye protection, with dust control', 'Un respirador o mascarilla y protección ocular, con control de polvo'], ['Nothing', 'Ninguna'], ['Only a baseball cap', 'Solo una gorra'], ['Sunscreen', 'Protector solar']],
    ['How should seams be arranged when hanging sheets?', '¿Cómo se deben acomodar las juntas al colocar las hojas?',
      ['Staggered so end joints do not line up', 'Alternadas para que las juntas de los extremos no se alineen'], ['All lined up in one straight column', 'Todas alineadas en una sola columna'], ['Over window corners', 'Sobre las esquinas de las ventanas'], ['Random, with large gaps filled by tape', 'Al azar, con huecos grandes rellenados con cinta']],
    ['How should joint compound be ready before sanding?', '¿Cómo debe estar el compuesto para juntas antes de lijar?',
      ['Completely dry', 'Completamente seco'], ['Still wet', 'Todavía húmedo'], ['Warm and soft', 'Tibio y blando'], ['Frozen', 'Congelado']],
    ['How do you fix a hole in drywall larger than about 6 inches?', '¿Cómo se repara un agujero en panel de yeso de más de unas 6 pulgadas?',
      ['Cut a clean opening, add backing, install a patch piece, then tape and finish', 'Cortar una abertura limpia, agregar soporte, colocar un parche, y luego emplastar y terminar'], ['Fill it with paper and paint over', 'Rellenarlo con papel y pintar encima'], ['Stuff with newspaper', 'Rellenar con periódico'], ['Cover with tape only', 'Cubrir solo con cinta']],
    ['What goes on outside corners of drywall?', '¿Qué se coloca en las esquinas exteriores del panel de yeso?',
      ['Corner bead (metal or vinyl)', 'Cantonera (metálica o de vinilo)'], ['Nothing', 'Nada'], ['Wood glue', 'Pegamento para madera'], ['A strip of carpet', 'Una tira de alfombra']],
    ['What does a Level 5 finish mean?', '¿Qué significa un acabado Nivel 5?',
      ['A skim coat over the whole surface for the smoothest result, good under gloss paint', 'Una capa fina sobre toda la superficie para un resultado muy liso, ideal bajo pintura brillante'], ['Raw board with no compound', 'Panel sin compuesto'], ['Only the fasteners are covered', 'Solo se cubren los tornillos'], ['A heavy texture', 'Una textura gruesa']],
    ['What should you check before drilling or cutting drywall?', '¿Qué debe revisar antes de taladrar o cortar un panel de yeso?',
      ['For wires, pipes and studs behind it', 'Si hay cables, tuberías y montantes detrás'], ['Nothing', 'Nada'], ['Only the paint color', 'Solo el color de la pintura'], ['How loud the drill is', 'Qué tan ruidoso es el taladro']]
  ],

  'General handyman': [
    ['How can you find a stud in a wall?', '¿Cómo se puede encontrar un montante en una pared?',
      ['With a stud finder, and confirm by checking nearby spots', 'Con un detector de montantes, confirmando en puntos cercanos'], ['By guessing', 'Adivinando'], ['By drilling many large holes', 'Haciendo muchos agujeros grandes'], ['It is not possible', 'No es posible']],
    ['How should you hang a heavy mirror on drywall where there is no stud?', '¿Cómo se cuelga un espejo pesado en un panel de yeso donde no hay montante?',
      ['Use a rated heavy-duty anchor such as a toggle bolt', 'Usar un ancla resistente con capacidad adecuada, como un tornillo de mariposa'], ['A small nail', 'Un clavo pequeño'], ['Tape', 'Cinta adhesiva'], ['Glue only', 'Solo pegamento']],
    ['Which way do you turn a standard screw to tighten it?', '¿En qué dirección se gira un tornillo estándar para apretarlo?',
      ['Clockwise', 'En el sentido de las agujas del reloj'], ['Counterclockwise', 'En sentido contrario a las agujas del reloj'], ['Back and forth', 'De ida y vuelta'], ['It depends on the day', 'Depende del día']],
    ['What should you know first in any plumbing emergency?', '¿Qué debe saber primero en cualquier emergencia de plomería?',
      ['Where the main water shutoff is', 'Dónde está la llave de paso principal'], ['Where the mop is', 'Dónde está el trapeador'], ['Where the paint is', 'Dónde está la pintura'], ['The neighbor\'s phone number', 'El teléfono del vecino']],
    ['A toilet keeps running. What is the most common cause?', 'Un inodoro no deja de correr. ¿Cuál es la causa más común?',
      ['A worn flapper or a faulty fill valve', 'Una aleta (flapper) desgastada o una válvula de llenado defectuosa'], ['The bowl is too big', 'La taza es demasiado grande'], ['The floor is cold', 'El piso está frío'], ['Too much toilet paper', 'Demasiado papel higiénico']],
    ['A faucet drips. What is a common repair?', 'Una llave gotea. ¿Cuál es una reparación común?',
      ['Replace the worn cartridge, washer or O-ring', 'Cambiar el cartucho, la arandela o el anillo desgastado'], ['Paint the faucet', 'Pintar la llave'], ['Raise the water pressure', 'Subir la presión del agua'], ['Ignore it forever', 'Ignorarla para siempre']],
    ['An outlet suddenly has no power. What should you check first?', 'Un tomacorriente se quedó sin energía de repente. ¿Qué debe revisar primero?',
      ['The breaker and any GFCI outlet that may have tripped', 'El interruptor automático y cualquier tomacorriente GFCI que se haya disparado'], ['Replace the wall', 'Cambiar la pared'], ['Hit the outlet with a hammer', 'Golpear el tomacorriente con un martillo'], ['Pour water in it', 'Echarle agua']],
    ['What is the safe way to use an extension ladder?', '¿Cuál es la forma segura de usar una escalera extensible?',
      ['Set it on level ground at about a 4-to-1 angle and keep three points of contact', 'Colocarla en suelo nivelado con una inclinación de 4 a 1 y mantener tres puntos de contacto'], ['Lean it straight up at a steep angle', 'Apoyarla casi vertical'], ['Stand on the top rung', 'Pararse en el último peldaño'], ['Place it on boxes for extra height', 'Ponerla sobre cajas para ganar altura']],
    ['What should you check before drilling into a wall?', '¿Qué debe revisar antes de taladrar una pared?',
      ['For hidden pipes and electrical wires', 'Si hay tuberías o cables eléctricos ocultos'], ['Nothing', 'Nada'], ['The weather', 'El clima'], ['The color of the wall', 'El color de la pared']],
    ['What are the steps to patch a small nail hole in a wall?', '¿Cuáles son los pasos para reparar un agujero pequeño de clavo en una pared?',
      ['Fill with spackle, sand smooth, prime and paint', 'Rellenar con masilla, lijar liso, imprimar y pintar'], ['Paint over the hole', 'Pintar encima del agujero'], ['Fill with toothpaste', 'Rellenar con pasta de dientes'], ['Cover with a sticker', 'Cubrir con una calcomanía']],
    ['A door sticks in humid weather. What is a typical fix?', 'Una puerta se atora con la humedad. ¿Cuál es una solución típica?',
      ['Check the hinges, then sand or plane the sticking edge and seal it', 'Revisar las bisagras, luego lijar o cepillar el borde que roza y sellarlo'], ['Cut the door in half', 'Cortar la puerta por la mitad'], ['Remove the door frame', 'Quitar el marco'], ['Paint the hinges shut', 'Pintar las bisagras cerradas']],
    ['A kitchen drain is slow. What is the best first step?', 'El desagüe de la cocina está lento. ¿Cuál es el mejor primer paso?',
      ['Try a plunger or drain snake and clean the trap', 'Probar un destapador o una sonda y limpiar el sifón'], ['Pour a full bottle of drain cleaner every day', 'Echar un frasco entero de destapacaños todos los días'], ['Remove the sink', 'Quitar el fregadero'], ['Pour grease down the drain', 'Echar grasa por el desagüe']],
    ['Which jobs should be referred to a licensed professional?', '¿Qué trabajos se deben remitir a un profesional con licencia?',
      ['Gas lines, the main electrical panel and anything the law requires a license for', 'Líneas de gas, el panel eléctrico principal y todo lo que la ley exige con licencia'], ['Changing a light bulb', 'Cambiar un foco'], ['Tightening a cabinet knob', 'Apretar un tirador de gabinete'], ['Hanging a picture', 'Colgar un cuadro']],
    ['What does good customer service look like on a job?', '¿Cómo es un buen servicio al cliente en un trabajo?',
      ['Arrive on time, communicate, protect floors and clean up', 'Llegar a tiempo, comunicarse, proteger los pisos y limpiar'], ['Arrive whenever and leave a mess', 'Llegar cuando sea y dejar desorden'], ['Ignore the homeowner', 'Ignorar al propietario'], ['Use the customer\'s tools without asking', 'Usar las herramientas del cliente sin preguntar']],
    ['You notice an unexpected problem (like water damage) while working. What should you do?', 'Nota un problema inesperado (como daño por agua) mientras trabaja. ¿Qué debe hacer?',
      ['Stop, take photos and tell the office or lead right away', 'Detenerse, tomar fotos y avisar de inmediato a la oficina o al responsable'], ['Cover it up and keep going', 'Taparlo y seguir'], ['Tell nobody', 'No decirle a nadie'], ['Fix it however you like without telling anyone', 'Arreglarlo como quiera sin avisar']]
  ]
};

const ALIASES = { Other: 'General handyman' };
const TRADE_LIST = Object.keys(BANKS);
const PASS_PERCENT = 70, TIME_LIMIT_MIN = 30, BANK_SIZE = 15;

const bankFor = trade => BANKS[ALIASES[trade] || trade] || null;

// Small deterministic PRNG so an attempt can be regenerated from its seed when it is graded.
function rng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
function shuffle(list, rand) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

// The attempt is rebuilt from its stored seed, so the client only ever sees question ids and the displayed option position.
function build(trade, seed, lang = 'en') {
  const bank = bankFor(trade);
  if (!bank) return null;
  const rand = rng(seed), li = lang === 'es' ? 1 : 0;
  return shuffle(bank.map((row, id) => ({ id, row })), rand).map(({ id, row }) => ({
    id, q: row[li], o: shuffle([0, 1, 2, 3].map(i => ({ i, t: row[2 + i][li] })), rand)
  }));
}
const forClient = questions => questions.map(x => ({ id: x.id, q: x.q, o: x.o.map(o => o.t) }));

// answers: { [questionId]: displayedOptionPosition }. The correct option is original index 0 in the bank data.
function grade(trade, seed, lang, answers) {
  const bank = bankFor(trade), questions = build(trade, seed, lang);
  if (!bank || !questions) return null;
  const a = answers && typeof answers === 'object' ? answers : {};
  let score = 0;
  const missed = [];
  for (const x of questions) {
    const shown = a[x.id], pick = Number.isInteger(shown) ? x.o[shown] : null, row = bank[x.id];
    if (pick && pick.i === 0) score++;
    else missed.push({ id: x.id, question: row[0], correct: row[2][0], given: pick ? row[2 + pick.i][0] : null });
  }
  const percent = Math.round(score / bank.length * 100);
  return { score, total: bank.length, percent, passed: percent >= PASS_PERCENT, missed };
}

module.exports = { BANKS, TRADE_LIST, PASS_PERCENT, TIME_LIMIT_MIN, BANK_SIZE, bankFor, build, forClient, grade };
